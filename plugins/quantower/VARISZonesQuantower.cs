using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Net.Http;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;
using TradingPlatform.BusinessLayer.Chart;

namespace RSLevelsQuantower
{
    // VARIS Zones concept credited to RocketScooter community member IAmTheLiquidity2.
    public class VARISZonesQuantower : Indicator
    {
        private const string Build = "VARIS Quantower v2026.06.21.1";
        private static readonly HttpClient Client = new HttpClient();
        private readonly object sync = new object();
        private DateTime nextPollUtc = DateTime.MinValue;
        private DateTime lastStatsUtc = DateTime.MinValue;
        private bool polling;
        private double? capturedRiskInterval;
        private string sourceState = "waiting";
        private string lastIssue = "";
        private string lastSymbol = "";
        private double cumulativeTpv;
        private double cumulativeVolume;
        private int currentSessionKey = int.MinValue;
        private TimeZoneInfo easternTime;

        public VARISZonesQuantower()
        {
            this.Name = "VARIS Zones Quantower";
            this.ShortName = "VARIS Zones";
            this.SeparateWindow = false;
            this.OnBackGround = false;
            this.AllowFitAuto = false;
            this.AddLineSeries("VWAP", Color.Red, 1, LineStyle.Solid);
            this.AddLineSeries("Upper Half RI", Color.DimGray, 1, LineStyle.Solid);
            this.AddLineSeries("Lower Half RI", Color.DimGray, 1, LineStyle.Solid);
            this.AddLineSeries("Upper Full RI", Color.Gray, 1, LineStyle.Solid);
            this.AddLineSeries("Lower Full RI", Color.Gray, 1, LineStyle.Solid);
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

        [InputParameter("Manual Risk Interval", 4, 0.001, 10000, 0.25, 3)]
        public double ManualRiskInterval = 25.0;

        [InputParameter("Use captured RI", 5)]
        public bool UseCapturedRiskInterval = true;

        [InputParameter("Show VWAP", 6)]
        public bool ShowVWAP = true;

        [InputParameter("Show half RI bands", 7)]
        public bool ShowHalfRiskBands = true;

        [InputParameter("Show full RI bands", 8)]
        public bool ShowFullRiskBands = true;

        [InputParameter("Show fills", 9)]
        public bool ShowFills = true;

        [InputParameter("Fill opacity %", 10, 0, 50, 1, 0)]
        public int FillOpacity = 12;

        [InputParameter("Show status", 11)]
        public bool ShowStatus = true;

        protected override void OnInit()
        {
            ResetSnapshot();
            ResetVwap();
            easternTime = ResolveEasternTimeZone();
            nextPollUtc = DateTime.MinValue;
        }

        protected override void OnClear()
        {
            ResetSnapshot();
            ResetVwap();
        }

        protected override void OnUpdate(UpdateArgs args)
        {
            MaybePoll();
            UpdateVwapBands();
        }

        public override void OnPaintChart(PaintChartEventArgs args)
        {
            if (!ShowStatus || args == null || args.Graphics == null)
                return;

            Rectangle rect = args.Rectangle;
            if (rect.Width <= 0 || rect.Height <= 0)
                return;

            string state;
            string issue;
            string symbol;
            DateTime lastStats;
            double ri = ResolveRiskInterval();
            lock (sync)
            {
                state = sourceState;
                issue = lastIssue;
                symbol = lastSymbol;
                lastStats = lastStatsUtc;
            }

            bool stale = lastStats == DateTime.MinValue || (DateTime.UtcNow - lastStats).TotalSeconds > Math.Max(1, StaleSeconds) || state == "stale";
            Color color = state == "offline" ? Color.IndianRed : stale ? Color.Orange : Color.LimeGreen;
            string status = state == "offline"
                ? "VARIS offline " + issue
                : stale
                    ? "VARIS stale " + DisplaySymbol(symbol) + " RI " + ri.ToString("0.##", CultureInfo.InvariantCulture)
                    : "VARIS " + DisplaySymbol(symbol) + " RI " + ri.ToString("0.##", CultureInfo.InvariantCulture) + "  " + Build;

            using (Font font = new Font("Consolas", 10, FontStyle.Bold))
            using (Brush textBrush = new SolidBrush(color))
            using (Brush backBrush = new SolidBrush(Color.FromArgb(155, 16, 20, 24)))
            {
                SizeF size = args.Graphics.MeasureString(status, font);
                RectangleF box = new RectangleF(rect.Left + 8, rect.Bottom - size.Height - 10, size.Width + 8, size.Height + 4);
                args.Graphics.FillRectangle(backBrush, box);
                args.Graphics.DrawString(status, font, textBrush, box.Left + 4, box.Top + 2);
            }
        }

        private void MaybePoll()
        {
            if (polling || DateTime.UtcNow < nextPollUtc)
                return;
            string symbol = ResolveSymbol();
            nextPollUtc = DateTime.UtcNow.AddMilliseconds(Math.Max(250, RefreshMilliseconds));
            _ = PollAsync(symbol);
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

        private void UpdateVwapBands()
        {
            DateTime barTime = this.Time();
            int nextSessionKey = SessionKey(barTime);
            if (currentSessionKey == int.MinValue || nextSessionKey != currentSessionKey)
            {
                cumulativeTpv = 0.0;
                cumulativeVolume = 0.0;
                currentSessionKey = nextSessionKey;
            }

            double typical = (this.High() + this.Low() + this.Close()) / 3.0;
            double volume = Math.Max(0.0, this.Volume());
            cumulativeTpv += typical * volume;
            cumulativeVolume += volume;

            double vwap = cumulativeVolume > 0.0 ? cumulativeTpv / cumulativeVolume : double.NaN;
            double ri = ResolveRiskInterval();
            double half = ri * 0.5;

            this.SetValue(ShowVWAP ? vwap : double.NaN, 0);
            this.SetValue(ShowHalfRiskBands ? vwap + half : double.NaN, 1);
            this.SetValue(ShowHalfRiskBands ? vwap - half : double.NaN, 2);
            this.SetValue(ShowFullRiskBands ? vwap + ri : double.NaN, 3);
            this.SetValue(ShowFullRiskBands ? vwap - ri : double.NaN, 4);

            if (ShowFills)
            {
                int alpha = Math.Max(0, Math.Min(128, (int)Math.Round(255 * Math.Max(0, Math.Min(50, FillOpacity)) / 100.0)));
                Color halfFill = Color.FromArgb(alpha, 255, 255, 255);
                Color fullFill = Color.FromArgb(Math.Max(0, alpha / 2), 0, 0, 0);
                this.BeginCloud(0, 1, halfFill);
                this.BeginCloud(0, 2, halfFill);
                this.BeginCloud(0, 3, fullFill);
                this.BeginCloud(0, 4, fullFill);
            }
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

        private void ResetSnapshot()
        {
            lock (sync)
            {
                sourceState = "waiting";
                capturedRiskInterval = null;
                lastStatsUtc = DateTime.MinValue;
                lastIssue = "";
                lastSymbol = "";
            }
        }

        private void ResetVwap()
        {
            cumulativeTpv = 0.0;
            cumulativeVolume = 0.0;
            currentSessionKey = int.MinValue;
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
    }
}
