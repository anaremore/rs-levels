using System;
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
    public class VARISZones : Indicator
    {
        private const string Build = "VARIS NT8 v2026.06.21.1";
        private static readonly HttpClient Client = new HttpClient();
        private readonly object sync = new object();
        private DateTime lastPollUtc = DateTime.MinValue;
        private DateTime lastStatsUtc = DateTime.MinValue;
        private bool polling;
        private double? capturedRiskInterval;
        private string sourceState = "waiting";
        private string lastIssue = "";
        private double cumulativeTpv;
        private double cumulativeVolume;
        private int currentSessionKey = int.MinValue;
        private TimeZoneInfo easternTime;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "VARIS Zones";
                Description = "Display-only VWAP bands using RS Levels risk interval. VARIS concept credited to IAmTheLiquidity2.";
                IsOverlay = true;
                Calculate = Calculate.OnBarClose;
                IsSuspendedWhileInactive = true;

                ServiceUrl = "http://127.0.0.1:8765";
                SymbolOverride = "";
                RefreshMilliseconds = 1000;
                StaleSeconds = 82800;
                ManualRiskInterval = 25.0;
                UseCapturedRiskInterval = true;
                ShowVWAP = true;
                ShowHalfRiskBands = true;
                ShowFullRiskBands = true;
                ShowStatus = true;

                AddPlot(Brushes.Red, "VWAP");
                AddPlot(Brushes.DarkGray, "Upper Half RI");
                AddPlot(Brushes.DarkGray, "Lower Half RI");
                AddPlot(Brushes.Gray, "Upper Full RI");
                AddPlot(Brushes.Gray, "Lower Full RI");
            }
            else if (State == State.DataLoaded)
            {
                ResetVwapState();
                easternTime = ResolveEasternTimeZone();
            }
            else if (State == State.Terminated)
            {
                RemoveDrawObject(Tag("status"));
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 0)
                return;

            if (!polling && (DateTime.UtcNow - lastPollUtc).TotalMilliseconds >= Math.Max(250, RefreshMilliseconds))
            {
                lastPollUtc = DateTime.UtcNow;
                _ = PollAsync(ResolveSymbol());
            }

            UpdateVwapBands();
            DrawStatusText();
        }

        private async Task PollAsync(string symbol)
        {
            polling = true;
            try
            {
                string baseUrl = CleanBaseUrl(ServiceUrl);
                string statusText = await Client.GetStringAsync(baseUrl + "/status").ConfigureAwait(false);
                string nextState = FindSourceState(statusText);
                string rows = await Client.GetStringAsync(baseUrl + "/stats/" + Uri.EscapeDataString(symbol) + "?format=rows").ConfigureAwait(false);
                double? nextRiskInterval = ParseRiskInterval(rows);

                lock (sync)
                {
                    sourceState = nextState;
                    capturedRiskInterval = nextRiskInterval;
                    lastStatsUtc = DateTime.UtcNow;
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

        private void UpdateVwapBands()
        {
            int nextSessionKey = SessionKey(Time[0]);
            if (CurrentBar == 0 || nextSessionKey != currentSessionKey)
            {
                cumulativeTpv = 0.0;
                cumulativeVolume = 0.0;
                currentSessionKey = nextSessionKey;
            }

            double typical = (High[0] + Low[0] + Close[0]) / 3.0;
            double volume = Math.Max(0.0, Convert.ToDouble(Volume[0], CultureInfo.InvariantCulture));
            cumulativeTpv += typical * volume;
            cumulativeVolume += volume;

            double vwap = cumulativeVolume > 0.0 ? cumulativeTpv / cumulativeVolume : double.NaN;
            double ri = ResolveRiskInterval();
            double half = ri * 0.5;

            Values[0][0] = ShowVWAP ? vwap : double.NaN;
            Values[1][0] = ShowHalfRiskBands ? vwap + half : double.NaN;
            Values[2][0] = ShowHalfRiskBands ? vwap - half : double.NaN;
            Values[3][0] = ShowFullRiskBands ? vwap + ri : double.NaN;
            Values[4][0] = ShowFullRiskBands ? vwap - ri : double.NaN;
        }

        private void DrawStatusText()
        {
            if (!ShowStatus)
            {
                RemoveDrawObject(Tag("status"));
                return;
            }

            double ri = ResolveRiskInterval();
            string state;
            string issue;
            DateTime lastStats;
            lock (sync)
            {
                state = sourceState;
                issue = lastIssue;
                lastStats = lastStatsUtc;
            }

            bool stale = lastStats == DateTime.MinValue || (DateTime.UtcNow - lastStats).TotalSeconds > Math.Max(1, StaleSeconds) || state == "stale";
            Brush brush = state == "offline" ? Brushes.IndianRed : stale ? Brushes.Orange : Brushes.LimeGreen;
            string text = state == "offline"
                ? "VARIS offline " + issue
                : stale
                    ? "VARIS stale " + DisplaySymbol(ResolveSymbol()) + " RI " + ri.ToString("0.##", CultureInfo.InvariantCulture)
                    : "VARIS " + DisplaySymbol(ResolveSymbol()) + " RI " + ri.ToString("0.##", CultureInfo.InvariantCulture) + "  " + Build;

            Draw.TextFixed(
                this,
                Tag("status"),
                text,
                TextPosition.BottomLeft,
                brush,
                new SimpleFont("Arial", 12),
                Brushes.Transparent,
                Brushes.Transparent,
                0);
        }

        private double ResolveRiskInterval()
        {
            double? value;
            lock (sync)
            {
                value = capturedRiskInterval;
            }
            if (UseCapturedRiskInterval && value.HasValue && value.Value > 0.0)
                return value.Value;
            return Math.Max(0.001, ManualRiskInterval);
        }

        private int SessionKey(DateTime barTime)
        {
            DateTime et = TimeZoneInfo.ConvertTime(barTime, easternTime ?? TimeZoneInfo.Local);
            DateTime sessionDate = et.Hour >= 18 ? et.Date.AddDays(1) : et.Date;
            return sessionDate.Year * 10000 + sessionDate.Month * 100 + sessionDate.Day;
        }

        private void ResetVwapState()
        {
            cumulativeTpv = 0.0;
            cumulativeVolume = 0.0;
            currentSessionKey = int.MinValue;
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

        private static string DisplaySymbol(string symbol)
        {
            return NormalizeSymbol(symbol) == "MNQ" ? "NQ" : "ES";
        }

        private static string CleanBaseUrl(string value)
        {
            return (value ?? "http://127.0.0.1:8765").Trim().TrimEnd('/');
        }

        private static TimeZoneInfo ResolveEasternTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time");
            }
            catch
            {
                return TimeZoneInfo.Local;
            }
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

        private static double? ParseRiskInterval(string rows)
        {
            string[] lines = (rows ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string line in lines)
            {
                string[] parts = line.Split(',');
                if (parts.Length < 2)
                    continue;
                string name = parts[0].Trim();
                if (!name.Equals("RI", StringComparison.OrdinalIgnoreCase) &&
                    !name.Equals("RiskInterval", StringComparison.OrdinalIgnoreCase) &&
                    !name.Equals("Risk Interval", StringComparison.OrdinalIgnoreCase))
                    continue;
                double value;
                if (double.TryParse(parts[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out value) && value > 0.0)
                    return value;
            }
            return null;
        }

        private static string Tag(string name)
        {
            return "varis-zones-" + name;
        }

        [NinjaScriptProperty]
        [Display(Name = "Service URL", GroupName = "VARIS Zones")]
        public string ServiceUrl { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Symbol override", GroupName = "VARIS Zones")]
        public string SymbolOverride { get; set; }

        [NinjaScriptProperty]
        [Range(250, 60000)]
        [Display(Name = "Refresh milliseconds", GroupName = "VARIS Zones")]
        public int RefreshMilliseconds { get; set; }

        [NinjaScriptProperty]
        [Range(1, 86400)]
        [Display(Name = "Stale seconds", GroupName = "VARIS Zones")]
        public int StaleSeconds { get; set; }

        [NinjaScriptProperty]
        [Range(0.001, 10000)]
        [Display(Name = "Manual Risk Interval", GroupName = "VARIS Zones")]
        public double ManualRiskInterval { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Use captured RI", GroupName = "VARIS Zones")]
        public bool UseCapturedRiskInterval { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show VWAP", GroupName = "VARIS Zones")]
        public bool ShowVWAP { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show half RI bands", GroupName = "VARIS Zones")]
        public bool ShowHalfRiskBands { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show full RI bands", GroupName = "VARIS Zones")]
        public bool ShowFullRiskBands { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Show status", GroupName = "VARIS Zones")]
        public bool ShowStatus { get; set; }
    }
}
