#include "sierrachart.h"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>

SCDLLName("VARIS Zones")

namespace
{
constexpr const char* VARIS_BUILD = "varis-sierra-2026-06-22.1";
constexpr int REQUEST_NONE = 0;
constexpr int REQUEST_FEED = 1;
constexpr int STATUS_LINE = 736000;
constexpr int HTTP_TIMEOUT_SEC = 10;

std::string Trim(const std::string& value)
{
    const char* whitespace = " \t\r\n";
    const size_t first = value.find_first_not_of(whitespace);
    if (first == std::string::npos)
        return "";
    const size_t last = value.find_last_not_of(whitespace);
    return value.substr(first, last - first + 1);
}

std::string Upper(std::string value)
{
    for (char& ch : value)
        ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
    return value;
}

int AtLeast(int minimum, int value)
{
    return value < minimum ? minimum : value;
}

double PositiveOr(double value, double fallback)
{
    return value > 0.0 ? value : fallback;
}

SCString CleanBaseUrl(const char* input)
{
    std::string value(input ? input : "");
    while (!value.empty() && value[value.size() - 1] == '/')
        value.pop_back();
    return value.c_str();
}

std::vector<std::string> SplitRow(const std::string& row)
{
    std::vector<std::string> fields;
    std::stringstream stream(row);
    std::string field;
    while (std::getline(stream, field, ','))
        fields.push_back(Trim(field));
    return fields;
}

double FindRiskInterval(const SCString& body)
{
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row))
    {
        const std::vector<std::string> fields = SplitRow(row);
        if (fields.size() < 2)
            continue;
        const std::string name = Upper(fields[0]);
        if (name != "RI" && name != "RISKINTERVAL" && name != "RISK INTERVAL")
            continue;
        char* end = nullptr;
        const double value = std::strtod(fields[1].c_str(), &end);
        return end == fields[1].c_str() ? 0.0 : value;
    }
    return 0.0;
}

std::string FindSourceState(const SCString& body)
{
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row))
    {
        const std::vector<std::string> fields = SplitRow(row);
        if (fields.size() >= 2 && Upper(fields[0]) == "STATE")
            return fields[1];
    }
    return "unknown";
}

std::string DisplaySymbol(const char* input)
{
    const std::string text = Upper(input ? input : "");
    return text.find("NQ") != std::string::npos ? "NQ" : "ES";
}

void DrawStatus(SCStudyInterfaceRef sc, const char* text, COLORREF color)
{
    s_UseTool tool;
    tool.Clear();
    tool.ChartNumber = sc.ChartNumber;
    tool.DrawingType = DRAWING_STATIONARY_TEXT;
    tool.LineNumber = STATUS_LINE;
    tool.AddMethod = UTAM_ADD_OR_ADJUST;
    tool.Region = sc.GraphRegion;
    tool.BeginDateTime = 5;
    tool.BeginValue = 8;
    tool.UseRelativeVerticalValues = 1;
    tool.Color = color;
    tool.FontSize = 10;
    tool.Text = text;
    sc.UseTool(tool);
}
}

SCSFExport scsf_VARISZones(SCStudyInterfaceRef sc)
{
    SCInputRef ServiceUrl = sc.Input[0];
    SCInputRef Symbol = sc.Input[1];
    SCInputRef RefreshMs = sc.Input[2];
    SCInputRef ManualRiskInterval = sc.Input[3];
    SCInputRef UseApiRiskInterval = sc.Input[4];
    SCInputRef ResetHourEt = sc.Input[5];
    SCInputRef StaleSeconds = sc.Input[6];
    SCInputRef ShowStatus = sc.Input[7];
    SCInputRef ShowVwap = sc.Input[8];
    SCInputRef ShowHalfBands = sc.Input[9];
    SCInputRef ShowFullBands = sc.Input[10];
    SCInputRef VwapColor = sc.Input[11];
    SCInputRef HalfBandColor = sc.Input[12];
    SCInputRef FullBandColor = sc.Input[13];
    SCInputRef VwapWidth = sc.Input[14];
    SCInputRef BandWidth = sc.Input[15];

    SCSubgraphRef Vwap = sc.Subgraph[0];
    SCSubgraphRef UpperHalf = sc.Subgraph[1];
    SCSubgraphRef LowerHalf = sc.Subgraph[2];
    SCSubgraphRef UpperFull = sc.Subgraph[3];
    SCSubgraphRef LowerFull = sc.Subgraph[4];

    if (sc.SetDefaults)
    {
        sc.GraphName = "VARIS Zones";
        sc.StudyDescription = "Display-only VWAP bands using RS Levels risk interval. VARIS concept credited to IAmTheLiquidity2.";
        sc.AutoLoop = 0;
        sc.UpdateAlways = 1;
        sc.GraphRegion = 0;
        sc.GraphDrawType = GDT_CUSTOM;
        sc.DrawZeros = 0;

        ServiceUrl.Name = "Service URL";
        ServiceUrl.SetString("http://127.0.0.1:8765");

        Symbol.Name = "Symbol";
        Symbol.SetString("MES");

        RefreshMs.Name = "Refresh interval milliseconds";
        RefreshMs.SetInt(1000);
        RefreshMs.SetIntLimits(250, 60000);

        ManualRiskInterval.Name = "Manual Risk Interval points";
        ManualRiskInterval.SetFloat(25.0f);
        ManualRiskInterval.SetFloatLimits(0.001f, 10000.0f);

        UseApiRiskInterval.Name = "Use captured RI when available";
        UseApiRiskInterval.SetYesNo(1);

        ResetHourEt.Name = "Session reset hour ET";
        ResetHourEt.SetInt(18);
        ResetHourEt.SetIntLimits(0, 23);

        StaleSeconds.Name = "Local stale seconds";
        StaleSeconds.SetInt(82800);
        StaleSeconds.SetIntLimits(1, 86400);

        ShowStatus.Name = "Show status";
        ShowStatus.SetYesNo(1);

        ShowVwap.Name = "Show VWAP";
        ShowVwap.SetYesNo(1);

        ShowHalfBands.Name = "Show half RI bands";
        ShowHalfBands.SetYesNo(1);

        ShowFullBands.Name = "Show full RI bands";
        ShowFullBands.SetYesNo(1);

        VwapColor.Name = "VWAP color";
        VwapColor.SetColor(RGB(255, 0, 0));

        HalfBandColor.Name = "Half RI band color";
        HalfBandColor.SetColor(RGB(220, 220, 220));

        FullBandColor.Name = "Full RI band color";
        FullBandColor.SetColor(RGB(120, 120, 120));

        VwapWidth.Name = "VWAP line width";
        VwapWidth.SetInt(1);
        VwapWidth.SetIntLimits(1, 5);

        BandWidth.Name = "Band line width";
        BandWidth.SetInt(1);
        BandWidth.SetIntLimits(1, 5);

        Vwap.Name = "VWAP";
        UpperHalf.Name = "Upper Half RI";
        LowerHalf.Name = "Lower Half RI";
        UpperFull.Name = "Upper Full RI";
        LowerFull.Name = "Lower Full RI";
        for (int i = 0; i < 5; ++i)
        {
            sc.Subgraph[i].DrawStyle = DRAWSTYLE_LINE;
            sc.Subgraph[i].DrawZeros = 0;
        }
        return;
    }

    int& requestState = sc.GetPersistentInt(1);
    int& lastRequestSeconds = sc.GetPersistentInt(2);
    int& lastFeedSeconds = sc.GetPersistentInt(3);
    double& capturedRiskInterval = sc.GetPersistentDouble(1);
    SCString& sourceState = sc.GetPersistentSCString(1);
    SCString& lastIssue = sc.GetPersistentSCString(2);

    const int nowSeconds = sc.CurrentSystemDateTime.GetTimeInSeconds();
    const int refreshSeconds = AtLeast(1, RefreshMs.GetInt() / 1000);

    if (lastRequestSeconds > 0 && nowSeconds < lastRequestSeconds)
    {
        requestState = REQUEST_NONE;
        lastRequestSeconds = 0;
    }

    if (requestState == REQUEST_NONE && (lastRequestSeconds == 0 || nowSeconds - lastRequestSeconds >= refreshSeconds))
    {
        const SCString baseUrl = CleanBaseUrl(ServiceUrl.GetString());
        SCString url;
        url.Format("%s/sierra/%s", baseUrl.GetChars(), Symbol.GetString());
        sc.HTTPResponse = "";
        sc.MakeHTTPRequest(url);
        requestState = REQUEST_FEED;
        lastRequestSeconds = nowSeconds;
    }

    if (requestState != REQUEST_NONE && sc.HTTPResponse.GetLength() == 0 && nowSeconds - lastRequestSeconds >= HTTP_TIMEOUT_SEC)
    {
        lastIssue = "HTTP timeout";
        requestState = REQUEST_NONE;
        sc.HTTPResponse = "";
    }

    if (requestState == REQUEST_FEED && sc.HTTPResponse.GetLength() > 0)
    {
        sourceState = FindSourceState(sc.HTTPResponse).c_str();
        const double nextRi = FindRiskInterval(sc.HTTPResponse);
        if (nextRi > 0.0)
            capturedRiskInterval = nextRi;
        lastFeedSeconds = nowSeconds;
        lastIssue = "";
        requestState = REQUEST_NONE;
        sc.HTTPResponse = "";
    }

    const bool apiEnabled = UseApiRiskInterval.GetYesNo() != 0;
    const bool hasCapturedRiskInterval = capturedRiskInterval > 0.0;
    const double riskInterval = apiEnabled
        ? PositiveOr(capturedRiskInterval, ManualRiskInterval.GetFloat())
        : ManualRiskInterval.GetFloat();
    const double halfRisk = riskInterval * 0.5;
    const int resetHour = ResetHourEt.GetInt();

    Vwap.PrimaryColor = VwapColor.GetColor();
    UpperHalf.PrimaryColor = HalfBandColor.GetColor();
    LowerHalf.PrimaryColor = HalfBandColor.GetColor();
    UpperFull.PrimaryColor = FullBandColor.GetColor();
    LowerFull.PrimaryColor = FullBandColor.GetColor();
    Vwap.LineWidth = static_cast<unsigned short>(VwapWidth.GetInt());
    for (int i = 1; i < 5; ++i)
        sc.Subgraph[i].LineWidth = static_cast<unsigned short>(BandWidth.GetInt());

    double cumulativeTpv = 0.0;
    double cumulativeVolume = 0.0;
    for (int i = 0; i < sc.ArraySize; ++i)
    {
        const SCDateTime dateTime = sc.BaseDateTimeIn[i];
        const bool reset = i == 0 || (dateTime.GetHour() == resetHour && dateTime.GetMinute() == 0);
        const double typical = (static_cast<double>(sc.High[i]) + static_cast<double>(sc.Low[i]) + static_cast<double>(sc.Close[i])) / 3.0;
        const double volume = static_cast<double>(sc.Volume[i]);
        if (reset)
        {
            cumulativeTpv = typical * volume;
            cumulativeVolume = volume;
        }
        else
        {
            cumulativeTpv += typical * volume;
            cumulativeVolume += volume;
        }

        const double value = cumulativeVolume > 0.0 ? cumulativeTpv / cumulativeVolume : 0.0;
        Vwap[i] = ShowVwap.GetYesNo() != 0 ? static_cast<float>(value) : 0.0f;
        UpperHalf[i] = ShowHalfBands.GetYesNo() != 0 ? static_cast<float>(value + halfRisk) : 0.0f;
        LowerHalf[i] = ShowHalfBands.GetYesNo() != 0 ? static_cast<float>(value - halfRisk) : 0.0f;
        UpperFull[i] = ShowFullBands.GetYesNo() != 0 ? static_cast<float>(value + riskInterval) : 0.0f;
        LowerFull[i] = ShowFullBands.GetYesNo() != 0 ? static_cast<float>(value - riskInterval) : 0.0f;
    }

    if (ShowStatus.GetYesNo() != 0)
    {
        COLORREF color = RGB(76, 175, 80);
        SCString status;
        const bool stale = lastFeedSeconds == 0 || nowSeconds - lastFeedSeconds > AtLeast(1, StaleSeconds.GetInt()) || sourceState == "stale";
        if (lastIssue.GetLength())
        {
            color = RGB(242, 54, 69);
            status.Format("VARIS issue %s", lastIssue.GetChars());
        }
        else if (stale)
        {
            color = RGB(255, 152, 0);
            status.Format("VARIS stale %s RI %.2f", sourceState.GetLength() ? sourceState.GetChars() : "unknown", riskInterval);
        }
        else if (apiEnabled && !hasCapturedRiskInterval)
        {
            color = RGB(255, 152, 0);
            status.Format("VARIS %s manual RI %.2f  %s", DisplaySymbol(Symbol.GetString()).c_str(), riskInterval, VARIS_BUILD);
        }
        else if (!apiEnabled)
        {
            status.Format("VARIS %s manual RI %.2f  %s", DisplaySymbol(Symbol.GetString()).c_str(), riskInterval, VARIS_BUILD);
        }
        else
        {
            status.Format("VARIS %s API RI %.2f  %s", DisplaySymbol(Symbol.GetString()).c_str(), riskInterval, VARIS_BUILD);
        }
        DrawStatus(sc, status.GetChars(), color);
    }
    else
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, STATUS_LINE);
    }
}
