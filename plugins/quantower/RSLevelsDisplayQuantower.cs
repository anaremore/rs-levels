using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Net.Http;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;
using TradingPlatform.BusinessLayer.Chart;

namespace RSLevelsQuantower
{
    public class RSLevelsDisplayQuantower : Indicator
    {
        private const int MaxLevels = 100;
        private static readonly HttpClient Client = new HttpClient();
        private readonly object sync = new object();
        private List<LevelRow> levels = new List<LevelRow>();
        private DateTime nextPollUtc = DateTime.MinValue;
        private DateTime lastLevelsUtc = DateTime.MinValue;
        private bool polling;
        private string sourceState = "waiting";
        private string lastIssue = "";
        private string lastSymbol = "";

        public RSLevelsDisplayQuantower()
        {
            this.Name = "RS Levels Display";
            this.ShortName = "RS Levels";
            this.SeparateWindow = false;
            this.OnBackGround = false;
            this.AllowFitAuto = false;
            this.AddLineSeries("RS Levels", Color.Transparent, 1, LineStyle.Solid);
        }

        [InputParameter("Service URL", 0)]
        public string ServiceUrl = "http://127.0.0.1:8765";

        [InputParameter("Symbol Override", 1, variants: new object[]
        {
            "Auto", "Auto",
            "MES", "MES",
            "MNQ", "MNQ",
            "ES", "ES",
            "NQ", "NQ"
        })]
        public string SymbolOverride = "Auto";

        [InputParameter("Refresh milliseconds", 2, 250, 60000, 250, 0)]
        public int RefreshMilliseconds = 1000;

        [InputParameter("Stale seconds", 3, 1, 86400, 1, 0)]
        public int StaleSeconds = 82800;

        [InputParameter("Show labels", 4)]
        public bool ShowLabels = true;

        [InputParameter("Show zone fills", 5)]
        public bool ShowZoneFills = true;

        [InputParameter("Zone fill opacity %", 6, 0, 50, 1, 0)]
        public int ZoneFillOpacity = 12;

        [InputParameter("Label vertical offset pixels", 7, 0, 80, 1, 0)]
        public int LabelVerticalOffsetPixels = 10;

        [InputParameter("Line width", 8, 1, 6, 1, 0)]
        public int LineWidth = 2;

        protected override void OnInit()
        {
            ClearSnapshot();
            nextPollUtc = DateTime.MinValue;
        }

        protected override void OnClear()
        {
            ClearSnapshot();
        }

        protected override void OnUpdate(UpdateArgs args)
        {
            this.SetValue(double.NaN);
            if (!polling && DateTime.UtcNow >= nextPollUtc)
            {
                nextPollUtc = DateTime.UtcNow.AddMilliseconds(Math.Max(250, RefreshMilliseconds));
                _ = PollAsync(ResolveSymbol());
            }
        }

        public override void OnPaintChart(PaintChartEventArgs args)
        {
            IChartWindow mainWindow = this.CurrentChart != null ? this.CurrentChart.MainWindow : null;
            if (mainWindow == null || mainWindow.CoordinatesConverter == null || args == null || args.Graphics == null)
                return;

            List<LevelRow> copy;
            DateTime lastLevels;
            string state;
            string issue;
            string symbol;
            lock (sync)
            {
                copy = new List<LevelRow>(levels);
                lastLevels = lastLevelsUtc;
                state = sourceState;
                issue = lastIssue;
                symbol = lastSymbol;
            }

            Rectangle rect = args.Rectangle;
            DrawZoneFills(args.Graphics, mainWindow, rect, copy);
            DrawLevels(args.Graphics, mainWindow, rect, copy);
            DrawStatus(args.Graphics, rect, symbol, state, issue, lastLevels);
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

                lock (sync)
                {
                    levels = nextLevels;
                    sourceState = nextState;
                    lastLevelsUtc = DateTime.UtcNow;
                    lastIssue = "";
                    lastSymbol = symbol;
                }
            }
            catch (Exception ex)
            {
                lock (sync)
                {
                    sourceState = "offline";
                    lastIssue = ex.GetType().Name;
                    lastSymbol = symbol;
                }
            }
            finally
            {
                polling = false;
            }
        }

        private void DrawLevels(Graphics graphics, IChartWindow window, Rectangle rect, List<LevelRow> rows)
        {
            using (Font font = new Font("Consolas", 10, FontStyle.Bold))
            {
                foreach (LevelRow level in rows)
                {
                    float y = (float)window.CoordinatesConverter.GetChartY(level.Price);
                    if (y < rect.Top - 40 || y > rect.Bottom + 40)
                        continue;

                    Color color = Color.FromArgb(level.Red, level.Green, level.Blue);
                    using (Pen pen = new Pen(color, Math.Max(1, LineWidth)))
                        graphics.DrawLine(pen, rect.Left, y, rect.Right, y);

                    if (!ShowLabels)
                        continue;

                    string label = DisplayLabel(level) + " " + level.Price.ToString("0.00", CultureInfo.InvariantCulture);
                    SizeF size = graphics.MeasureString(label, font);
                    float x = Math.Max(rect.Left + 6, rect.Right - size.Width - 6);
                    float labelY = y - LabelDirection(level) * Math.Max(0, LabelVerticalOffsetPixels) - size.Height / 2f;
                    using (Brush back = new SolidBrush(Color.FromArgb(150, 16, 20, 24)))
                    using (Brush brush = new SolidBrush(color))
                    {
                        graphics.FillRectangle(back, x - 3, labelY - 1, size.Width + 6, size.Height + 2);
                        graphics.DrawString(label, font, brush, x, labelY);
                    }
                }
            }
        }

        private void DrawZoneFills(Graphics graphics, IChartWindow window, Rectangle rect, List<LevelRow> rows)
        {
            if (!ShowZoneFills)
                return;

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
                        DrawZoneFill(graphics, window, rect, bullTop, bullBottom);
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
                        DrawZoneFill(graphics, window, rect, bearTop, bearBottom);
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
                        DrawZoneFill(graphics, window, rect, zoneTop, zoneBottom);
                        zoneTop = null;
                        zoneBottom = null;
                    }
                }
            }
        }

        private void DrawZoneFill(Graphics graphics, IChartWindow window, Rectangle rect, LevelRow first, LevelRow second)
        {
            float y1 = (float)window.CoordinatesConverter.GetChartY(first.Price);
            float y2 = (float)window.CoordinatesConverter.GetChartY(second.Price);
            float top = Math.Min(y1, y2);
            float bottom = Math.Max(y1, y2);
            if (bottom < rect.Top || top > rect.Bottom)
                return;

            float clippedTop = Math.Max(rect.Top, top);
            float clippedBottom = Math.Min(rect.Bottom, bottom);
            int alpha = Math.Max(0, Math.Min(128, (int)Math.Round(255 * Math.Max(0, Math.Min(50, ZoneFillOpacity)) / 100.0)));
            Color color = Color.FromArgb(alpha, first.Red, first.Green, first.Blue);
            using (Brush brush = new SolidBrush(color))
                graphics.FillRectangle(brush, rect.Left, clippedTop, rect.Width, Math.Max(1f, clippedBottom - clippedTop));
        }

        private void DrawStatus(Graphics graphics, Rectangle rect, string symbol, string state, string issue, DateTime lastLevels)
        {
            bool stale = lastLevels == DateTime.MinValue || (DateTime.UtcNow - lastLevels).TotalSeconds > Math.Max(1, StaleSeconds) || state == "stale";
            Color color = state == "offline" ? Color.IndianRed : stale ? Color.Orange : Color.LimeGreen;
            string status = state == "offline"
                ? "RS Levels offline " + issue
                : stale
                    ? "RS Levels stale " + state
                    : "RS Levels live " + state;
            if (!string.IsNullOrWhiteSpace(symbol))
                status += " " + symbol;

            using (Font font = new Font("Consolas", 10, FontStyle.Bold))
            using (Brush textBrush = new SolidBrush(color))
            using (Brush backBrush = new SolidBrush(Color.FromArgb(150, 16, 20, 24)))
            {
                SizeF size = graphics.MeasureString(status, font);
                RectangleF box = new RectangleF(rect.Left + 8, rect.Top + 8, size.Width + 8, size.Height + 4);
                graphics.FillRectangle(backBrush, box);
                graphics.DrawString(status, font, textBrush, box.Left + 4, box.Top + 2);
            }
        }

        private void ClearSnapshot()
        {
            lock (sync)
            {
                levels = new List<LevelRow>();
                sourceState = "waiting";
                lastIssue = "";
                lastSymbol = "";
                lastLevelsUtc = DateTime.MinValue;
            }
        }

        private string ResolveSymbol()
        {
            string value = (SymbolOverride ?? "").Trim().ToUpperInvariant();
            if (!string.IsNullOrEmpty(value) && value != "AUTO")
                return NormalizeSymbol(value);
            string chartName = this.Symbol != null ? this.Symbol.Name : "";
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

        private static int ParseColor(string value)
        {
            int parsed;
            if (!int.TryParse((value ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                return 158;
            return Math.Max(0, Math.Min(255, parsed));
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
            if (text.Contains("OPEN") || text.Contains("CLOSE") || text.Contains("GAP")) return "open-close";
            return "unknown";
        }

        private sealed class LevelRow
        {
            public string Name;
            public double Price;
            public int Red;
            public int Green;
            public int Blue;
            public string Kind;
        }
    }
}
