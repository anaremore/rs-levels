package com.rslevels.bookmap;

import java.awt.Color;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import velox.api.layer1.annotations.Layer1ApiVersion;
import velox.api.layer1.annotations.Layer1ApiVersionValue;
import velox.api.layer1.annotations.Layer1SimpleAttachable;
import velox.api.layer1.annotations.Layer1StrategyName;
import velox.api.layer1.common.Log;
import velox.api.layer1.data.InstrumentInfo;
import velox.api.layer1.data.InitialState;
import velox.api.layer1.messages.indicators.IndicatorColorScheme;
import velox.api.layer1.messages.indicators.IndicatorLineStyle;
import velox.api.layer1.messages.indicators.Layer1ApiUserMessageModifyIndicator;
import velox.api.layer1.messages.indicators.Layer1ApiUserMessageModifyIndicator.GraphType;
import velox.api.layer1.messages.indicators.Layer1ApiUserMessageModifyIndicator.LayerRenderPriority;
import velox.api.layer1.simplified.Api;
import velox.api.layer1.simplified.CustomModule;

@Layer1SimpleAttachable
@Layer1StrategyName("RS Levels Display")
@Layer1ApiVersion(Layer1ApiVersionValue.VERSION1)
public class RSLevelsDisplayBookmap implements CustomModule {
    private static final String INDICATOR_NAME = "RS Levels Display";
    private static final int MAX_LEVELS = 500;
    private static final String COLOR_BLUE = "RS_BLUE";
    private static final String COLOR_CYAN = "RS_CYAN";
    private static final String COLOR_GREEN = "RS_GREEN";
    private static final String COLOR_ORANGE = "RS_ORANGE";
    private static final String COLOR_PINK = "RS_PINK";
    private static final String COLOR_PURPLE = "RS_PURPLE";
    private static final String COLOR_RED = "RS_RED";
    private static final String COLOR_YELLOW = "RS_YELLOW";
    private static final String COLOR_WHITE = "RS_WHITE";

    private Api api;
    private String alias;
    private String symbol;
    private String serviceUrl;
    private int refreshMs;
    private int staleSeconds;
    private ScheduledExecutorService worker;
    private volatile Map<Double, String> horizontalLines = Collections.emptyMap();
    private volatile String sourceState = "waiting";
    private volatile String statsSummary = "";
    private volatile long lastLevelsMs = 0L;
    private volatile Layer1ApiUserMessageModifyIndicator indicatorMessage;

    @Override
    public void initialize(String alias, InstrumentInfo info, Api api, InitialState initialState) {
        this.alias = alias;
        this.api = api;
        this.serviceUrl = cleanBaseUrl(System.getProperty("rslevels.serviceUrl", "http://127.0.0.1:8765"));
        this.refreshMs = clampInt(readIntProperty("rslevels.refreshMs", 1000), 250, 60000);
        this.staleSeconds = clampInt(readIntProperty("rslevels.staleSeconds", 82800), 1, 86400);
        this.symbol = normalizeSymbol(System.getProperty("rslevels.symbol", alias));

        registerIndicator();
        worker = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "rs-levels-bookmap");
            thread.setDaemon(true);
            return thread;
        });
        worker.scheduleWithFixedDelay(this::pollSafely, 0, refreshMs, TimeUnit.MILLISECONDS);
    }

    @Override
    public void stop() {
        if (worker != null) {
            worker.shutdownNow();
            worker = null;
        }
        horizontalLines = Collections.emptyMap();
        if (api != null && indicatorMessage != null)
            api.sendUserMessage(new Layer1ApiUserMessageModifyIndicator(indicatorMessage, false));
    }

    private void registerIndicator() {
        if (api != null && indicatorMessage != null)
            api.sendUserMessage(new Layer1ApiUserMessageModifyIndicator(indicatorMessage, false));
        indicatorMessage = Layer1ApiUserMessageModifyIndicator
            .builder(RSLevelsDisplayBookmap.class, INDICATOR_NAME)
            .extendFullName(aliasSuffix(alias) + statsSuffix())
            .setGraphType(GraphType.PRIMARY)
            .setIndicatorColorScheme(new RsColorScheme())
            .setIndicatorLineStyle(IndicatorLineStyle.DEFAULT)
            .setGraphLayerRenderPriority(LayerRenderPriority.ABSOLUTE_TOP)
            .setIsLineEnabledByDefault(true)
            .setIsWidgetEnabledByDefault(false)
            .setIsSupportWidget(false)
            .setAliasFiler(new AliasFilter(alias))
            .setHorizontalValueLinesInfo(requestedAlias -> horizontalLines)
            .build();
        api.sendUserMessage(indicatorMessage);
    }

    private void pollSafely() {
        try {
            String status = httpGet(serviceUrl + "/status", 1500);
            sourceState = findSourceState(status);
            String rows = httpGet(serviceUrl + "/levels/" + urlPart(symbol) + "?format=rows", 1500);
            horizontalLines = parseRows(rows);
            String statsRows = httpGet(serviceUrl + "/stats/" + urlPart(symbol) + "?format=rows", 1500);
            updateStatsSummary(formatStatsSummary(statsRows));
            lastLevelsMs = System.currentTimeMillis();
        } catch (Exception ex) {
            sourceState = "offline";
            if (isStale())
                horizontalLines = Collections.emptyMap();
            Log.warn("RS Levels Bookmap display feed unavailable: " + ex.getClass().getSimpleName());
        }
    }

    private boolean isStale() {
        return lastLevelsMs == 0L || System.currentTimeMillis() - lastLevelsMs > TimeUnit.SECONDS.toMillis(staleSeconds) || "stale".equals(sourceState);
    }

    private void updateStatsSummary(String nextStatsSummary) {
        String next = nextStatsSummary == null ? "" : nextStatsSummary;
        if (next.equals(statsSummary))
            return;
        statsSummary = next;
        if (api != null)
            registerIndicator();
    }

    private static Map<Double, String> parseRows(String rows) {
        TreeMap<Double, String> out = new TreeMap<>();
        String[] lines = (rows == null ? "" : rows).split("\\r?\\n");
        for (String line : lines) {
            if (out.size() >= MAX_LEVELS)
                break;
            String[] parts = line.split(",");
            if (parts.length < 5)
                continue;
            try {
                double price = Double.parseDouble(parts[1].trim());
                String kind = parts.length >= 6 ? parts[5].trim() : "";
                if (kind.isEmpty())
                    kind = inferKind(parts[0]);
                out.put(uniquePrice(out, price), colorName(parts[2], parts[3], parts[4], kind));
            } catch (NumberFormatException ignored) {
            }
        }
        return Collections.unmodifiableMap(out);
    }

    private static String formatStatsSummary(String rows) {
        String dd = "";
        String res = "";
        String mres = "";
        String wres = "";
        String map = "";
        String[] lines = (rows == null ? "" : rows).split("\\r?\\n");
        for (String line : lines) {
            String[] parts = line.split(",");
            if (parts.length < 2)
                continue;
            String name = parts[0].trim().toUpperCase(Locale.ROOT);
            String value = parts[1].trim();
            if ("MAP".equals(name) || "MAPCODE".equals(name))
                map = value;
            else if ("DD".equals(name))
                dd = formatMetric(value);
            else if ("RES".equals(name))
                res = formatMetric(value);
            else if ("MRES".equals(name))
                mres = formatMetric(value);
            else if ("WRES".equals(name))
                wres = formatMetric(value);
        }

        String text = "";
        if (!map.isEmpty())
            text = appendPart(text, "Map " + map);
        text = appendPart(text, metricPart("DD", dd));
        text = appendPart(text, metricPart("Res", res));
        text = appendPart(text, metricPart("MRes", mres));
        text = appendPart(text, metricPart("WRes", wres));
        return text;
    }

    private static String metricPart(String name, String value) {
        return value.isEmpty() ? "" : name + " " + value;
    }

    private static String appendPart(String text, String part) {
        if (part == null || part.isEmpty())
            return text;
        return text.isEmpty() ? part : text + "  " + part;
    }

    private static String formatMetric(String value) {
        try {
            double number = Double.parseDouble(value);
            String text = String.format(Locale.ROOT, "%.2f", number);
            while (text.contains(".") && text.endsWith("0"))
                text = text.substring(0, text.length() - 1);
            if (text.endsWith("."))
                text = text.substring(0, text.length() - 1);
            return text;
        } catch (NumberFormatException ex) {
            return value == null ? "" : value;
        }
    }

    private static double uniquePrice(TreeMap<Double, String> existing, double price) {
        double value = price;
        while (existing.containsKey(value))
            value += 0.000001;
        return value;
    }

    private static String colorName(String red, String green, String blue, String kind) {
        String normalizedKind = kind == null ? "unknown" : kind.trim().toLowerCase(Locale.ROOT);
        if ("dd-band".equals(normalizedKind))
            return COLOR_CYAN;
        if ("hp".equals(normalizedKind))
            return COLOR_BLUE;
        if ("mhp".equals(normalizedKind))
            return COLOR_ORANGE;
        if ("open-close".equals(normalizedKind))
            return COLOR_WHITE;
        if ("reference".equals(normalizedKind))
            return COLOR_YELLOW;
        if ("yellow-line".equals(normalizedKind))
            return COLOR_YELLOW;
        if ("red-line".equals(normalizedKind))
            return COLOR_RED;
        if ("cat".equals(normalizedKind))
            return COLOR_PURPLE;
        if ("zone-bull".equals(normalizedKind) || "zone".equals(normalizedKind))
            return COLOR_GREEN;
        if ("zone-bear".equals(normalizedKind))
            return COLOR_PINK;

        int r = parseColor(red);
        int g = parseColor(green);
        int b = parseColor(blue);
        if (b >= r && b >= g)
            return g > 150 ? COLOR_CYAN : COLOR_BLUE;
        if (g >= r && g >= b)
            return COLOR_GREEN;
        if (r > 220 && g > 180)
            return COLOR_YELLOW;
        if (r > 200 && g > 100)
            return COLOR_ORANGE;
        if (r >= g && r >= b)
            return COLOR_RED;
        return COLOR_WHITE;
    }

    private static String inferKind(String name) {
        String text = name == null ? "" : name.toUpperCase(Locale.ROOT);
        if (text.contains("MHP"))
            return "mhp";
        if (text.contains("HP"))
            return "hp";
        if (text.contains("DD"))
            return "dd-band";
        if (text.contains("BRZ") || text.contains("BEAR"))
            return "zone-bear";
        if (text.contains("BZ") || text.contains("BULL"))
            return "zone-bull";
        if (text.contains("ZONE"))
            return "zone";
        if (text.contains("CAT"))
            return "cat";
        if (text.contains("YELLOW LINE") || "YL".equals(text))
            return "yellow-line";
        if (text.contains("RED LINE") || "RL".equals(text))
            return "red-line";
        if (text.contains("OPEN") || text.contains("CLOSE") || text.contains("GAP"))
            return "open-close";
        return "unknown";
    }

    private static int parseColor(String value) {
        try {
            return Math.max(0, Math.min(255, Integer.parseInt(value.trim())));
        } catch (Exception ex) {
            return 158;
        }
    }

    private static String findSourceState(String body) {
        String text = body == null ? "" : body;
        int sourceIndex = text.indexOf("\"source\"");
        if (sourceIndex < 0)
            return "unknown";
        int stateIndex = text.indexOf("\"state\"", sourceIndex);
        if (stateIndex < 0)
            return "unknown";
        int colonIndex = text.indexOf(':', stateIndex);
        int firstQuote = text.indexOf('"', colonIndex + 1);
        int secondQuote = text.indexOf('"', firstQuote + 1);
        if (firstQuote < 0 || secondQuote < 0)
            return "unknown";
        return text.substring(firstQuote + 1, secondQuote);
    }

    private static String httpGet(String target, int timeoutMs) throws IOException {
        HttpURLConnection connection = (HttpURLConnection)new URL(target).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(timeoutMs);
        connection.setReadTimeout(timeoutMs);
        connection.setUseCaches(false);
        try (InputStream stream = connection.getInputStream();
             BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null)
                text.append(line).append('\n');
            return text.toString();
        } finally {
            connection.disconnect();
        }
    }

    private static String normalizeSymbol(String value) {
        String text = value == null ? "" : value.toUpperCase(Locale.ROOT);
        if (text.contains("NQ"))
            return "MNQ";
        if (text.contains("ES"))
            return "MES";
        return "MES";
    }

    private static String cleanBaseUrl(String value) {
        String text = value == null ? "http://127.0.0.1:8765" : value.trim();
        while (text.endsWith("/"))
            text = text.substring(0, text.length() - 1);
        return text;
    }

    private static String urlPart(String value) {
        return value == null ? "MES" : value.replace(" ", "%20");
    }

    private static int readIntProperty(String key, int fallback) {
        try {
            return Integer.parseInt(System.getProperty(key, String.valueOf(fallback)));
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static int clampInt(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String aliasSuffix(String value) {
        return value == null || value.trim().isEmpty() ? "default" : value.replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    private String statsSuffix() {
        return statsSummary == null || statsSummary.isEmpty() ? "" : " " + statsSummary;
    }

    private static final class AliasFilter implements Predicate<String> {
        private final String expected;

        private AliasFilter(String expected) {
            this.expected = expected;
        }

        @Override
        public boolean test(String value) {
            return expected == null || expected.equals(value);
        }
    }

    private static final class RsColorScheme extends velox.compat.classreplace.v1.api.layer1.messages.indicators.IndicatorColorScheme {
        private final IndicatorColorScheme.ColorDescription[] colors = new IndicatorColorScheme.ColorDescription[] {
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_BLUE, new Color(41, 98, 255), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_CYAN, new Color(0, 188, 212), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_GREEN, new Color(76, 175, 80), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_ORANGE, new Color(255, 152, 0), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_PINK, new Color(240, 98, 146), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_PURPLE, new Color(126, 87, 194), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_RED, new Color(242, 54, 69), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_YELLOW, new Color(255, 235, 59), true),
            new IndicatorColorScheme.ColorDescription(RSLevelsDisplayBookmap.class, COLOR_WHITE, new Color(255, 255, 255), true)
        };

        @Override
        public IndicatorColorScheme.ColorDescription[] getColors() {
            return colors;
        }

        @Override
        public IndicatorColorScheme.ColorIntervalResponse getColorIntervalsList(double lower, double upper) {
            return new IndicatorColorScheme.ColorIntervalResponse(new String[] { COLOR_WHITE }, new double[] { upper });
        }
    }
}
