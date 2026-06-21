using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Media;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;

namespace NinjaTrader.NinjaScript.Indicators
{
    public class RSLevelsDisplay : Indicator
    {
        private const int MaxLevels = 500;
        private static readonly HttpClient Client = new HttpClient();
        private readonly object sync = new object();
        private List<LevelRow> levels = new List<LevelRow>();
        private StatsRow stats = new StatsRow();
        private DateTime lastPollUtc = DateTime.MinValue;
        private DateTime lastLevelsUtc = DateTime.MinValue;
        private bool polling;
        private int lastDrawnCount;
        private int lastZoneFillCount;
        private string sourceState = "waiting";
        private string lastIssue = "";

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "RS Levels Display";
                Description = "Display-only RS Levels overlay from the local API.";
                IsOverlay = true;
                Calculate = Calculate.OnBarClose;
                IsSuspendedWhileInactive = true;

                ServiceUrl = "http://127.0.0.1:8765";
                SymbolOverride = "";
                RefreshMilliseconds = 1000;
                StaleSeconds = 82800;
                ShowLabels = true;
                ShowZoneFills = true;
                ZoneFillOpacity = 12;
                LabelOffsetTicks = 2;
            }
            else if (State == State.Terminated)
            {
                ClearDrawings();
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 1)
                return;

            if (!polling && (DateTime.UtcNow - lastPollUtc).TotalMilliseconds >= Math.Max(250, RefreshMilliseconds))
            {
                lastPollUtc = DateTime.UtcNow;
                _ = PollAsync(ResolveSymbol());
            }

            DrawSnapshot();
        }

        private async Task PollAsync(string symbol)
        {
            polling = true;
            try
            {
                string baseUrl = CleanBaseUrl(ServiceUrl);
                string statusText = await Client.GetStringAsync(baseUrl + "/status").ConfigureAwait(false);
                string nextState = FindSourceState(statusText);
                string rows = await Client.GetStringAsync(baseUrl + "/levels/" + Uri.EscapeDataString(symbol) + "?format=rows").ConfigureAwait(false);
                List<LevelRow> nextLevels = ParseLevels(rows);
                string statsRows = await Client.GetStringAsync(baseUrl + "/stats/" + Uri.EscapeDataString(symbol) + "?format=rows").ConfigureAwait(false);
                StatsRow nextStats = ParseStats(statsRows);

                lock (sync)
                {
                    sourceState = nextState;
                    levels = nextLevels;
                    stats = nextStats;
                    lastLevelsUtc = DateTime.UtcNow;
                    lastIssue = "";
                }
            }
            catch (Exception ex)
            {
                lock (sync)
                {
                    sourceState = "offline";
                    lastIssue = ex.GetType().Name;
                }
            }
            finally
            {
                polling = false;
            }
        }

        private void DrawSnapshot()
        {
            List<LevelRow> copy;
            string state;
            string issue;
            DateTime lastLevels;
            StatsRow statsCopy;
            lock (sync)
            {
                copy = new List<LevelRow>(levels);
                state = sourceState;
                issue = lastIssue;
                lastLevels = lastLevelsUtc;
                statsCopy = stats.Copy();
            }

            bool stale = lastLevels == DateTime.MinValue || (DateTime.UtcNow - lastLevels).TotalSeconds > Math.Max(1, StaleSeconds) || state == "stale";
            Brush statusBrush = stale ? Brushes.Orange : Brushes.LimeGreen;
            if (state == "offline")
                statusBrush = Brushes.IndianRed;

            DrawZoneFills(copy);

            for (int i = 0; i < copy.Count; i++)
            {
                LevelRow level = copy[i];
                Brush brush = BrushFromLevel(level);
                Draw.HorizontalLine(this, Tag("line", i), level.Price, brush);
                if (ShowLabels)
                    Draw.Text(this, Tag("label", i), DisplayLabel(level) + " " + level.Price.ToString("0.00", CultureInfo.InvariantCulture), 0, LabelPrice(level), brush);
                else
                    RemoveDrawObject(Tag("label", i));
            }

            for (int i = copy.Count; i < lastDrawnCount; i++)
            {
                RemoveDrawObject(Tag("line", i));
                RemoveDrawObject(Tag("label", i));
            }
            lastDrawnCount = copy.Count;

            string status = state == "offline"
                ? "RS Levels offline " + issue
                : stale
                    ? "RS Levels stale " + state
                    : "RS Levels live " + state;

            Draw.TextFixed(
                this,
                Tag("status", 0),
                status,
                TextPosition.TopLeft,
                statusBrush,
                new SimpleFont("Arial", 12),
                Brushes.Transparent,
                Brushes.Transparent,
                0);

            string statsText = FormatStats(statsCopy, ResolveSymbol());
            if (!string.IsNullOrWhiteSpace(statsText))
                Draw.TextFixed(
                    this,
                    Tag("stats", 0),
                    statsText,
                    TextPosition.BottomLeft,
                    Brushes.White,
                    new SimpleFont("Consolas", 12),
                    Brushes.Transparent,
                    Brushes.Black,
                    80);
            else
                RemoveDrawObject(Tag("stats", 0));
        }

        private void ClearDrawings()
        {
            for (int i = 0; i < MaxLevels; i++)
            {
                RemoveDrawObject(Tag("line", i));
                RemoveDrawObject(Tag("label", i));
                RemoveDrawObject(Tag("zone", i));
            }
            RemoveDrawObject(Tag("status", 0));
            RemoveDrawObject(Tag("stats", 0));
        }

        private void DrawZoneFills(List<LevelRow> rows)
        {
            if (!ShowZoneFills)
            {
                ClearZoneFills();
                return;
            }

            int nextIndex = 0;
            LevelRow bullTop = null;
            LevelRow bullBottom = null;
            LevelRow bearTop = null;
            LevelRow bearBottom = null;
            LevelRow zoneTop = null;
            LevelRow zoneBottom = null;

            foreach (LevelRow level in rows)
            {
                if (!IsZone(level.Kind))
                    continue;

                int side = ZoneBoundarySide(level.Name);
                if (side == 0)
                    continue;

                if (level.Kind == "zone-bull")
                {
                    if (side > 0)
                        bullTop = level;
                    else
                        bullBottom = level;
                    if (bullTop != null && bullBottom != null)
                    {
                        DrawZoneFill(nextIndex++, bullTop, bullBottom);
                        bullTop = null;
                        bullBottom = null;
                    }
                }
                else if (level.Kind == "zone-bear")
                {
                    if (side > 0)
                        bearTop = level;
                    else
                        bearBottom = level;
                    if (bearTop != null && bearBottom != null)
                    {
                        DrawZoneFill(nextIndex++, bearTop, bearBottom);
                        bearTop = null;
                        bearBottom = null;
                    }
                }
                else
                {
                    if (side > 0)
                        zoneTop = level;
                    else
                        zoneBottom = level;
                    if (zoneTop != null && zoneBottom != null)
                    {
                        DrawZoneFill(nextIndex++, zoneTop, zoneBottom);
                        zoneTop = null;
                        zoneBottom = null;
                    }
                }
            }

            for (int i = nextIndex; i < lastZoneFillCount; i++)
                RemoveDrawObject(Tag("zone", i));
            lastZoneFillCount = nextIndex;
        }

        private void DrawZoneFill(int index, LevelRow first, LevelRow second)
        {
            double top = Math.Max(first.Price, second.Price);
            double bottom = Math.Min(first.Price, second.Price);
            Brush brush = BrushFromLevel(first);
            Draw.Rectangle(this, Tag("zone", index), false, 1, top, 0, bottom, Brushes.Transparent, brush, Math.Max(0, Math.Min(50, ZoneFillOpacity)));
        }

        private void ClearZoneFills()
        {
            for (int i = 0; i < lastZoneFillCount; i++)
                RemoveDrawObject(Tag("zone", i));
            lastZoneFillCount = 0;
        }

        private string ResolveSymbol()
        {
            string value = (SymbolOverride ?? "").Trim().ToUpperInvariant();
            if (!string.IsNullOrEmpty(value))
                return NormalizeSymbol(value);
            string chartName = Instrument != null && Instrument.MasterInstrument != null ? Instrument.MasterInstrument.Name : "";
            return NormalizeSymbol(chartName);
        }

        private static string NormalizeSymbol(string value)
        {
            string text = (value ?? "").ToUpperInvariant();
            if (text.Contains("NQ"))
                return "MNQ";
            if (text.Contains("ES"))
                return "MES";
            return "MES";
        }

        private static string CleanBaseUrl(string value)
        {
            return (value ?? "http://127.0.0.1:8765").Trim().TrimEnd('/');
        }

        private static string FindSourceState(string body)
        {
            string text = body ?? "";
            int sourceIndex = text.IndexOf("\"source\"", StringComparison.OrdinalIgnoreCase);
            if (sourceIndex < 0)
                return "unknown";
            int stateIndex = text.IndexOf("\"state\"", sourceIndex, StringComparison.OrdinalIgnoreCase);
            if (stateIndex < 0)
                return "unknown";
            int colonIndex = text.IndexOf(':', stateIndex);
            int firstQuote = text.IndexOf('"', colonIndex + 1);
            int secondQuote = text.IndexOf('"', firstQuote + 1);
            if (firstQuote < 0 || secondQuote < 0)
                return "unknown";
            return text.Substring(firstQuote + 1, secondQuote - firstQuote - 1);
        }

        private static List<LevelRow> ParseLevels(string rows)
        {
            List<LevelRow> result = new List<LevelRow>();
            string[] lines = (rows ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                if (result.Count >= MaxLevels)
                    break;
                string[] parts = line.Split(',');
                if (parts.Length < 5)
                    continue;
                double price;
                if (!double.TryParse(parts[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out price))
                    continue;
                string kind = parts.Length >= 6 ? parts[5].Trim() : "";
                if (string.IsNullOrEmpty(kind))
                    kind = InferKind(parts[0]);

                result.Add(new LevelRow
                {
                    Name = parts[0].Trim(),
                    Price = price,
                    Red = ParseColor(parts[2]),
                    Green = ParseColor(parts[3]),
                    Blue = ParseColor(parts[4]),
                    Kind = kind
                });
            }
            return result;
        }

        private static StatsRow ParseStats(string rows)
        {
            StatsRow result = new StatsRow();
            string[] lines = (rows ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                string[] parts = line.Split(',');
                if (parts.Length < 2)
                    continue;
                string name = parts[0].Trim();
                string value = parts[1].Trim();
                if (name.Equals("Map", StringComparison.OrdinalIgnoreCase) || name.Equals("MapCode", StringComparison.OrdinalIgnoreCase))
                {
                    result.MapCode = value;
                    continue;
                }
                double number;
                if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out number))
                    continue;
                if (name.Equals("DD", StringComparison.OrdinalIgnoreCase))
                    result.Dd = number;
                else if (name.Equals("Res", StringComparison.OrdinalIgnoreCase))
                    result.Res = number;
                else if (name.Equals("MRes", StringComparison.OrdinalIgnoreCase))
                    result.MRes = number;
                else if (name.Equals("WRes", StringComparison.OrdinalIgnoreCase))
                    result.WRes = number;
            }
            return result;
        }

        private static string FormatStats(StatsRow row, string symbol)
        {
            if (row == null || !row.HasValues)
                return "";
            StringBuilder text = new StringBuilder();
            text.Append("RS Levels ").Append(DisplaySymbol(symbol));
            if (!string.IsNullOrWhiteSpace(row.MapCode))
                text.Append("  Map ").Append(row.MapCode);
            string values = "";
            values = AppendStat(values, "DD", row.Dd);
            values = AppendStat(values, "Res", row.Res);
            values = AppendStat(values, "MRes", row.MRes);
            values = AppendStat(values, "WRes", row.WRes);
            if (!string.IsNullOrWhiteSpace(values))
                text.Append('\n').Append(values);
            return text.ToString();
        }

        private static string AppendStat(string text, string name, double? value)
        {
            if (!value.HasValue)
                return text;
            string part = name + " " + value.Value.ToString("0.##", CultureInfo.InvariantCulture);
            return string.IsNullOrWhiteSpace(text) ? part : text + "  " + part;
        }

        private static string DisplaySymbol(string symbol)
        {
            string normalized = NormalizeSymbol(symbol);
            return normalized == "MNQ" ? "NQ" : "ES";
        }

        private static int ParseColor(string value)
        {
            int parsed;
            if (!int.TryParse((value ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                return 158;
            return Math.Max(0, Math.Min(255, parsed));
        }

        private static Brush BrushFromLevel(LevelRow level)
        {
            SolidColorBrush brush = new SolidColorBrush(Color.FromRgb((byte)level.Red, (byte)level.Green, (byte)level.Blue));
            brush.Freeze();
            return brush;
        }

        private double LabelPrice(LevelRow level)
        {
            double tick = Instrument != null && Instrument.MasterInstrument != null
                ? Instrument.MasterInstrument.TickSize
                : TickSize;
            double offset = Math.Max(1, LabelOffsetTicks) * Math.Max(tick, 0.01);
            return level.Price + offset * LabelDirection(level);
        }

        private static string DisplayLabel(LevelRow level)
        {
            string name = level.Name ?? "Level";
            string upper = name.ToUpperInvariant();
            if (upper.Contains("PREVDAYCLOSE") || upper.Contains("PREV DAY CLOSE"))
                return "Prev Close";
            if (upper.Contains("LASTOPEN") || (upper.Contains("OPEN") && !upper.Contains("CLOSE")))
                return "Open";
            if (upper.Contains("CLOSE"))
                return "Close";
            if (level.Kind == "mhp" || upper.Contains("MHP"))
                return "MHP";
            if (level.Kind == "hp" || upper.Contains("HP"))
                return "HP";
            if (level.Kind == "dd-band" || upper.Contains("DD"))
                return "DD";
            if (level.Kind == "cat" || upper.Contains("CAT"))
                return "CAT";
            if (level.Kind == "yellow-line" || upper.Contains("YELLOW LINE") || upper == "YL")
                return "Yellow Line";
            if (level.Kind == "red-line" || upper.Contains("RED LINE") || upper == "RL")
                return "Red Line";
            return name.Replace("horizontal_line", "").Replace("horizontal_ray", "").Replace("horizontal", "").Replace("Liquidity Map", "").Replace("text", "").Trim();
        }

        private static int LabelDirection(LevelRow level)
        {
            string text = (level.Name ?? "").ToUpperInvariant();
            if (text.Contains("LOWER") || text.Contains("BZB") || text.Contains("BRZB") || level.Kind == "mhp" || level.Kind == "zone-bull")
                return -1;
            return 1;
        }

        private static bool IsZone(string kind)
        {
            return kind == "zone" || kind == "zone-bull" || kind == "zone-bear";
        }

        private static int ZoneBoundarySide(string name)
        {
            string text = (name ?? "").ToUpperInvariant();
            if (text.Contains("TOP") || text.Contains("UPPER") || text.Contains("BZT") || text.Contains("BRZT"))
                return 1;
            if (text.Contains("BOTTOM") || text.Contains("LOWER") || text.Contains("BZB") || text.Contains("BRZB"))
                return -1;
            return 0;
        }

        private static string InferKind(string name)
        {
            string text = (name ?? "").ToUpperInvariant();
            if (text.Contains("MHP")) return "mhp";
            if (text.Contains("HP")) return "hp";
            if (text.Contains("DD")) return "dd-band";
            if (text.Contains("BRZ") || text.Contains("BEAR")) return "zone-bear";
            if (text.Contains("BZ") || text.Contains("BULL")) return "zone-bull";
            if (text.Contains("ZONE")) return "zone";
            if (text.Contains("CAT")) return "cat";
            if (text.Contains("YELLOW LINE") || text == "YL") return "yellow-line";
            if (text.Contains("RED LINE") || text == "RL") return "red-line";
            if (text.Contains("OPEN") || text.Contains("CLOSE") || text.Contains("GAP")) return "open-close";
            return "unknown";
        }

        private static string Tag(string kind, int index)
        {
            return "rs-levels-" + kind + "-" + index.ToString(CultureInfo.InvariantCulture);
        }

        [NinjaScriptProperty]
        [Display(Name = "Service URL", GroupName = "RS Levels")]
        public string ServiceUrl { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Symbol override", GroupName = "RS Levels")]
        public string SymbolOverride { get; set; }

        [NinjaScriptProperty]
        [Range(250, 60000)]
        [Display(Name = "Refresh milliseconds", GroupName = "RS Levels")]
        public int RefreshMilliseconds { get; set; }

        [NinjaScriptProperty]
        [Range(1, 86400)]
        [Display(Name = "Stale seconds", GroupName = "RS Levels")]
        public int StaleSeconds { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show labels", GroupName = "RS Levels")]
        public bool ShowLabels { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show zone fills", GroupName = "RS Levels")]
        public bool ShowZoneFills { get; set; }

        [NinjaScriptProperty]
        [Range(0, 50)]
        [Display(Name = "Zone fill opacity", GroupName = "RS Levels")]
        public int ZoneFillOpacity { get; set; }

        [NinjaScriptProperty]
        [Range(1, 100)]
        [Display(Name = "Label offset ticks", GroupName = "RS Levels")]
        public int LabelOffsetTicks { get; set; }

        private sealed class LevelRow
        {
            public string Name { get; set; }
            public double Price { get; set; }
            public int Red { get; set; }
            public int Green { get; set; }
            public int Blue { get; set; }
            public string Kind { get; set; }
        }

        private sealed class StatsRow
        {
            public double? Dd { get; set; }
            public double? Res { get; set; }
            public double? MRes { get; set; }
            public double? WRes { get; set; }
            public string MapCode { get; set; }

            public bool HasValues
            {
                get
                {
                    return Dd.HasValue || Res.HasValue || MRes.HasValue || WRes.HasValue || !string.IsNullOrWhiteSpace(MapCode);
                }
            }

            public StatsRow Copy()
            {
                return new StatsRow
                {
                    Dd = Dd,
                    Res = Res,
                    MRes = MRes,
                    WRes = WRes,
                    MapCode = MapCode
                };
            }
        }
    }
}
