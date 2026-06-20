using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Media;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;

namespace NinjaTrader.NinjaScript.Indicators
{
    public class RSLevelsDisplay : Indicator
    {
        private const int MaxLevels = 100;
        private static readonly HttpClient Client = new HttpClient();
        private readonly object sync = new object();
        private List<LevelRow> levels = new List<LevelRow>();
        private DateTime lastPollUtc = DateTime.MinValue;
        private DateTime lastLevelsUtc = DateTime.MinValue;
        private bool polling;
        private int lastDrawnCount;
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
                StaleSeconds = 10;
                ShowLabels = true;
                LineWidth = 1;
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
                string rows = await Client.GetStringAsync(baseUrl + "/levels/" + Uri.EscapeDataString(symbol) + "?format=sierra").ConfigureAwait(false);
                List<LevelRow> nextLevels = ParseLevels(rows);

                lock (sync)
                {
                    sourceState = nextState;
                    levels = nextLevels;
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
            lock (sync)
            {
                copy = new List<LevelRow>(levels);
                state = sourceState;
                issue = lastIssue;
                lastLevels = lastLevelsUtc;
            }

            bool stale = lastLevels == DateTime.MinValue || (DateTime.UtcNow - lastLevels).TotalSeconds > Math.Max(1, StaleSeconds) || state == "stale";
            Brush statusBrush = stale ? Brushes.Orange : Brushes.LimeGreen;
            if (state == "offline")
                statusBrush = Brushes.IndianRed;

            for (int i = 0; i < copy.Count; i++)
            {
                LevelRow level = copy[i];
                Brush brush = BrushFromLevel(level);
                Draw.HorizontalLine(this, Tag("line", i), false, level.Price, brush, DashStyleHelper.Solid, LineWidth);
                if (ShowLabels)
                    Draw.Text(this, Tag("label", i), level.Name + " " + level.Price.ToString("0.00", CultureInfo.InvariantCulture), 0, level.Price, brush);
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
        }

        private void ClearDrawings()
        {
            for (int i = 0; i < MaxLevels; i++)
            {
                RemoveDrawObject(Tag("line", i));
                RemoveDrawObject(Tag("label", i));
            }
            RemoveDrawObject(Tag("status", 0));
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
                result.Add(new LevelRow
                {
                    Name = parts[0].Trim(),
                    Price = price,
                    Red = ParseColor(parts[2]),
                    Green = ParseColor(parts[3]),
                    Blue = ParseColor(parts[4])
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

        private static Brush BrushFromLevel(LevelRow level)
        {
            SolidColorBrush brush = new SolidColorBrush(Color.FromRgb((byte)level.Red, (byte)level.Green, (byte)level.Blue));
            brush.Freeze();
            return brush;
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
        [Range(1, 3600)]
        [Display(Name = "Stale seconds", GroupName = "RS Levels")]
        public int StaleSeconds { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show labels", GroupName = "RS Levels")]
        public bool ShowLabels { get; set; }

        [NinjaScriptProperty]
        [Range(1, 5)]
        [Display(Name = "Line width", GroupName = "RS Levels")]
        public int LineWidth { get; set; }

        private sealed class LevelRow
        {
            public string Name { get; set; }
            public double Price { get; set; }
            public int Red { get; set; }
            public int Green { get; set; }
            public int Blue { get; set; }
        }
    }
}
