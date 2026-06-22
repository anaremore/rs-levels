package com.rslevels.bookmap;

import java.awt.Color;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import velox.api.layer1.annotations.Layer1ApiVersion;
import velox.api.layer1.annotations.Layer1ApiVersionValue;
import velox.api.layer1.annotations.Layer1SimpleAttachable;
import velox.api.layer1.annotations.Layer1StrategyName;
import velox.api.layer1.common.Log;
import velox.api.layer1.data.InstrumentInfo;
import velox.api.layer1.data.InitialState;
import velox.api.layer1.layers.utils.OrderBook;
import velox.api.layer1.messages.indicators.Layer1ApiUserMessageModifyIndicator.GraphType;
import velox.api.layer1.simplified.Api;
import velox.api.layer1.simplified.Bar;
import velox.api.layer1.simplified.BarDataListener;
import velox.api.layer1.simplified.CustomModule;
import velox.api.layer1.simplified.Indicator;
import velox.api.layer1.simplified.Intervals;
import velox.api.layer1.simplified.LineStyle;

@Layer1SimpleAttachable
@Layer1StrategyName("VARIS Zones")
@Layer1ApiVersion(Layer1ApiVersionValue.VERSION1)
// VARIS Zones concept credited to RocketScooter community member IAmTheLiquidity2.
public class VARISZonesBookmap implements CustomModule, BarDataListener {
    private static final String BUILD = "VARIS Bookmap v2026.06.21.1";
    private static final String DEFAULT_SERVICE_URL = "http://127.0.0.1:8765";
    private static final ZoneId EASTERN = ZoneId.of("America/New_York");

    private Api api;
    private String alias = "";
    private String symbol = "MES";
    private String serviceUrl = DEFAULT_SERVICE_URL;
    private int refreshMs = 1000;
    private int timeoutMs = 1500;
    private boolean useCapturedRiskInterval = true;
    private double manualRiskInterval = 25.0;
    private volatile double capturedRiskInterval = 0.0;
    private volatile String sourceState = "waiting";
    private volatile String lastIssue = "";
    private ScheduledExecutorService worker;
    private Indicator vwapLine;
    private Indicator upperHalfLine;
    private Indicator lowerHalfLine;
    private Indicator upperFullLine;
    private Indicator lowerFullLine;
    private double cumulativeTpv;
    private double cumulativeVolume;
    private int currentSessionKey = Integer.MIN_VALUE;

    @Override
    public void initialize(String alias, InstrumentInfo info, Api api, InitialState initialState) {
        this.api = api;
        this.alias = alias == null ? "" : alias;
        this.serviceUrl = cleanBaseUrl(System.getProperty("rslevels.serviceUrl", DEFAULT_SERVICE_URL));
        this.refreshMs = clampInt(readIntProperty("rslevels.varis.refreshMs", 1000), 250, 60000);
        this.timeoutMs = clampInt(readIntProperty("rslevels.varis.timeoutMs", 1500), 250, 10000);
        this.manualRiskInterval = readDoubleProperty("rslevels.varis.manualRi", 25.0);
        this.useCapturedRiskInterval = readBooleanProperty("rslevels.varis.useCapturedRi", true);
        this.symbol = resolveSymbol(System.getProperty("rslevels.symbol", ""), this.alias, info);

        registerIndicators();
        resetVwap();
        worker = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "rs-levels-varis-bookmap");
            thread.setDaemon(true);
            return thread;
        });
        worker.scheduleWithFixedDelay(this::pollSafely, 0, refreshMs, TimeUnit.MILLISECONDS);
        Log.info("VARIS Zones Bookmap initialized: build=" + BUILD + ", alias=" + this.alias + ", symbol=" + symbol);
    }

    @Override
    public void stop() {
        if (worker != null) {
            worker.shutdownNow();
            worker = null;
        }
        publishMissing();
        Log.info("VARIS Zones Bookmap stopped for alias=" + alias);
    }

    @Override
    public void onBar(OrderBook orderBook, Bar bar) {
        if (bar == null)
            return;

        int nextSessionKey = currentEasternSessionKey();
        if (currentSessionKey == Integer.MIN_VALUE || currentSessionKey != nextSessionKey) {
            resetVwap();
            currentSessionKey = nextSessionKey;
        }

        double price = bar.getVwap();
        if (!isFinitePositive(price)) {
            price = (bar.getHigh() + bar.getLow() + bar.getClose()) / 3.0;
        }
        long rawVolume = bar.getVolumeTotal();
        double volume = rawVolume > 0L ? rawVolume : 0.0;
        if (!isFinitePositive(price) || volume <= 0.0)
            return;

        cumulativeTpv += price * volume;
        cumulativeVolume += volume;
        if (cumulativeVolume <= 0.0)
            return;

        double vwap = cumulativeTpv / cumulativeVolume;
        double riskInterval = riskInterval();
        double half = riskInterval * 0.5;
        publish(vwap, vwap + half, vwap - half, vwap + riskInterval, vwap - riskInterval);
    }

    @Override
    public long getInterval() {
        return Intervals.INTERVAL_1_MINUTE;
    }

    private void registerIndicators() {
        vwapLine = registerLine("VARIS VWAP", new Color(255, 0, 0));
        upperHalfLine = registerLine("VARIS Upper Half RI", new Color(96, 96, 96));
        lowerHalfLine = registerLine("VARIS Lower Half RI", new Color(96, 96, 96));
        upperFullLine = registerLine("VARIS Upper Full RI", new Color(150, 150, 150));
        lowerFullLine = registerLine("VARIS Lower Full RI", new Color(150, 150, 150));
    }

    private Indicator registerLine(String name, Color color) {
        Indicator indicator = api.registerIndicator(name, GraphType.PRIMARY, Double.NaN, true, true);
        indicator.setColor(color);
        indicator.setWidth(2);
        indicator.setLineStyle(LineStyle.SOLID);
        indicator.setRenderPriority(9000);
        return indicator;
    }

    private void pollSafely() {
        try {
            String baseUrl = cleanBaseUrl(serviceUrl);
            sourceState = findSourceState(httpGet(baseUrl + "/status", timeoutMs));
            String rows = httpGet(baseUrl + "/stats/" + urlPart(symbol) + "?format=rows", timeoutMs);
            double nextRiskInterval = parseRiskInterval(rows);
            if (nextRiskInterval > 0.0)
                capturedRiskInterval = nextRiskInterval;
            lastIssue = "";
        } catch (Exception ex) {
            sourceState = "offline";
            lastIssue = ex.getClass().getSimpleName();
            Log.warn("VARIS Zones Bookmap stats feed unavailable: " + lastIssue);
        }
    }

    private double riskInterval() {
        if (useCapturedRiskInterval && capturedRiskInterval > 0.0)
            return capturedRiskInterval;
        return Math.max(0.001, manualRiskInterval);
    }

    private void publish(double vwap, double upperHalf, double lowerHalf, double upperFull, double lowerFull) {
        vwapLine.addPoint(vwap);
        upperHalfLine.addPoint(upperHalf);
        lowerHalfLine.addPoint(lowerHalf);
        upperFullLine.addPoint(upperFull);
        lowerFullLine.addPoint(lowerFull);
    }

    private void publishMissing() {
        if (vwapLine != null)
            vwapLine.addPoint(Double.NaN);
        if (upperHalfLine != null)
            upperHalfLine.addPoint(Double.NaN);
        if (lowerHalfLine != null)
            lowerHalfLine.addPoint(Double.NaN);
        if (upperFullLine != null)
            upperFullLine.addPoint(Double.NaN);
        if (lowerFullLine != null)
            lowerFullLine.addPoint(Double.NaN);
    }

    private void resetVwap() {
        cumulativeTpv = 0.0;
        cumulativeVolume = 0.0;
    }

    private static int currentEasternSessionKey() {
        LocalDateTime now = LocalDateTime.now(EASTERN);
        LocalDate date = now.getHour() >= 18 ? now.toLocalDate().plusDays(1) : now.toLocalDate();
        return date.getYear() * 10000 + date.getMonthValue() * 100 + date.getDayOfMonth();
    }

    private static double parseRiskInterval(String rows) {
        String[] lines = (rows == null ? "" : rows).split("\\r?\\n");
        for (String line : lines) {
            String[] parts = line.split(",");
            if (parts.length < 2)
                continue;
            String name = parts[0].trim().toUpperCase(Locale.ROOT);
            if (!"RI".equals(name) && !"RISKINTERVAL".equals(name) && !"RISK INTERVAL".equals(name))
                continue;
            try {
                double value = Double.parseDouble(parts[1].trim());
                return value > 0.0 ? value : 0.0;
            } catch (NumberFormatException ignored) {
                return 0.0;
            }
        }
        return 0.0;
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

    private static String resolveSymbol(String override, String alias, InstrumentInfo info) {
        String normalized = normalizeSymbol(override);
        if (!normalized.isEmpty())
            return normalized;

        StringBuilder text = new StringBuilder();
        if (alias != null)
            text.append(alias).append(' ');
        if (info != null) {
            if (info.symbol != null)
                text.append(info.symbol).append(' ');
            if (info.fullName != null)
                text.append(info.fullName).append(' ');
        }
        normalized = normalizeSymbol(text.toString());
        return normalized.isEmpty() ? "MES" : normalized;
    }

    private static String normalizeSymbol(String value) {
        String text = value == null ? "" : value.toUpperCase(Locale.ROOT);
        if (text.contains("NQ"))
            return "MNQ";
        if (text.contains("ES"))
            return "MES";
        return "";
    }

    private static String cleanBaseUrl(String value) {
        String text = value == null || value.trim().isEmpty() ? DEFAULT_SERVICE_URL : value.trim();
        while (text.endsWith("/"))
            text = text.substring(0, text.length() - 1);
        return text;
    }

    private static String urlPart(String value) {
        return value == null ? "MES" : value.replace(" ", "%20");
    }

    private static boolean isFinitePositive(double value) {
        return value > 0.0 && !Double.isNaN(value) && !Double.isInfinite(value);
    }

    private static int readIntProperty(String key, int fallback) {
        try {
            return Integer.parseInt(System.getProperty(key, String.valueOf(fallback)).trim());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static double readDoubleProperty(String key, double fallback) {
        try {
            return Double.parseDouble(System.getProperty(key, String.valueOf(fallback)).trim());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static boolean readBooleanProperty(String key, boolean fallback) {
        String value = System.getProperty(key);
        if (value == null || value.trim().isEmpty())
            return fallback;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return "1".equals(normalized) || "true".equals(normalized) || "yes".equals(normalized);
    }

    private static int clampInt(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
