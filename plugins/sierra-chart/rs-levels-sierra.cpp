#include "sierrachart.h"

#include <algorithm>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>

SCDLLName("RS Levels Display")

namespace
{
constexpr int RS_MAX_LEVELS = 64;
constexpr int RS_LINE_BASE = 730000;
constexpr int RS_LABEL_BASE = 731000;
constexpr int RS_STATUS_LINE = 732000;
constexpr int RS_REQUEST_NONE = 0;
constexpr int RS_REQUEST_STATUS = 1;
constexpr int RS_REQUEST_LEVELS = 2;

struct RsLevel
{
    std::string name;
    double price = 0.0;
    int red = 158;
    int green = 158;
    int blue = 158;
};

std::string Trim(const std::string& value)
{
    const char* whitespace = " \t\r\n";
    const size_t first = value.find_first_not_of(whitespace);
    if (first == std::string::npos)
        return "";
    const size_t last = value.find_last_not_of(whitespace);
    return value.substr(first, last - first + 1);
}

int ClampColor(const std::string& value)
{
    const int parsed = std::atoi(value.c_str());
    return std::max(0, std::min(255, parsed));
}

bool ParseLevelRow(const std::string& row, RsLevel& out)
{
    std::vector<std::string> fields;
    std::stringstream stream(row);
    std::string field;
    while (std::getline(stream, field, ','))
        fields.push_back(Trim(field));

    if (fields.size() < 5 || fields[0].empty())
        return false;

    char* end = nullptr;
    const double price = std::strtod(fields[1].c_str(), &end);
    if (end == fields[1].c_str())
        return false;

    out.name = fields[0];
    out.price = price;
    out.red = ClampColor(fields[2]);
    out.green = ClampColor(fields[3]);
    out.blue = ClampColor(fields[4]);
    return true;
}

std::vector<RsLevel> ParseLevelsText(const SCString& body)
{
    std::vector<RsLevel> levels;
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row) && static_cast<int>(levels.size()) < RS_MAX_LEVELS)
    {
        RsLevel level;
        if (ParseLevelRow(row, level))
            levels.push_back(level);
    }
    return levels;
}

std::string FindSourceState(const SCString& body)
{
    const std::string text(body.GetChars());
    const size_t sourcePos = text.find("\"source\"");
    if (sourcePos == std::string::npos)
        return "unknown";
    const size_t statePos = text.find("\"state\"", sourcePos);
    if (statePos == std::string::npos)
        return "unknown";
    const size_t colonPos = text.find(':', statePos);
    const size_t firstQuote = text.find('"', colonPos);
    const size_t secondQuote = text.find('"', firstQuote + 1);
    if (firstQuote == std::string::npos || secondQuote == std::string::npos)
        return "unknown";
    return text.substr(firstQuote + 1, secondQuote - firstQuote - 1);
}

void DrawStatus(SCStudyInterfaceRef sc, const char* text, COLORREF color)
{
    s_UseTool tool;
    tool.Clear();
    tool.ChartNumber = sc.ChartNumber;
    tool.DrawingType = DRAWING_STATIONARY_TEXT;
    tool.LineNumber = RS_STATUS_LINE;
    tool.AddMethod = UTAM_ADD_OR_ADJUST;
    tool.Region = sc.GraphRegion;
    tool.BeginValue = 5;
    tool.BeginDateTime = 5;
    tool.Color = color;
    tool.FontSize = 10;
    tool.Text = text;
    sc.UseTool(tool);
}

void DrawLevel(SCStudyInterfaceRef sc, const RsLevel& level, int index, int lineWidth, bool showLabels)
{
    const int lineNumber = RS_LINE_BASE + index;
    const COLORREF color = RGB(level.red, level.green, level.blue);

    s_UseTool lineTool;
    lineTool.Clear();
    lineTool.ChartNumber = sc.ChartNumber;
    lineTool.DrawingType = DRAWING_HORIZONTALLINE;
    lineTool.LineNumber = lineNumber;
    lineTool.AddMethod = UTAM_ADD_OR_ADJUST;
    lineTool.Region = sc.GraphRegion;
    lineTool.BeginValue = static_cast<float>(level.price);
    lineTool.Color = color;
    lineTool.LineWidth = lineWidth;
    sc.UseTool(lineTool);

    if (!showLabels)
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LABEL_BASE + index);
        return;
    }

    SCString label;
    label.Format("%s %.2f", level.name.c_str(), level.price);

    s_UseTool labelTool;
    labelTool.Clear();
    labelTool.ChartNumber = sc.ChartNumber;
    labelTool.DrawingType = DRAWING_TEXT;
    labelTool.LineNumber = RS_LABEL_BASE + index;
    labelTool.AddMethod = UTAM_ADD_OR_ADJUST;
    labelTool.Region = sc.GraphRegion;
    labelTool.BeginIndex = std::max(0, sc.ArraySize - 1);
    labelTool.BeginValue = static_cast<float>(level.price);
    labelTool.Color = color;
    labelTool.FontSize = 9;
    labelTool.Text = label;
    sc.UseTool(labelTool);
}

void DeleteUnusedDrawings(SCStudyInterfaceRef sc, int usedCount)
{
    for (int i = usedCount; i < RS_MAX_LEVELS; ++i)
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LINE_BASE + i);
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LABEL_BASE + i);
    }
}

SCString CleanBaseUrl(const char* input)
{
    std::string value(input ? input : "");
    while (!value.empty() && value[value.size() - 1] == '/')
        value.pop_back();
    return value.c_str();
}
}

SCSFExport scsf_RSLevelsDisplay(SCStudyInterfaceRef sc)
{
    SCInputRef ServiceUrl = sc.Input[0];
    SCInputRef Symbol = sc.Input[1];
    SCInputRef RefreshMs = sc.Input[2];
    SCInputRef StaleSeconds = sc.Input[3];
    SCInputRef ShowLabels = sc.Input[4];
    SCInputRef LineWidth = sc.Input[5];

    if (sc.SetDefaults)
    {
        sc.GraphName = "RS Levels Display";
        sc.StudyDescription = "Display-only RS Levels overlay from the local API.";
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

        StaleSeconds.Name = "Local stale seconds";
        StaleSeconds.SetInt(82800);
        StaleSeconds.SetIntLimits(1, 86400);

        ShowLabels.Name = "Show labels";
        ShowLabels.SetYesNo(1);

        LineWidth.Name = "Line width";
        LineWidth.SetInt(1);
        LineWidth.SetIntLimits(1, 5);

        return;
    }

    int& requestState = sc.GetPersistentInt(1);
    int& requestType = sc.GetPersistentInt(2);
    int& lastRequestSeconds = sc.GetPersistentInt(3);
    int& lastLevelsSeconds = sc.GetPersistentInt(4);
    SCString& sourceState = sc.GetPersistentSCString(1);

    const int nowSeconds = sc.CurrentSystemDateTime.GetTimeInSeconds();
    const int refreshSeconds = std::max(1, RefreshMs.GetInt() / 1000);
    const int staleSeconds = std::max(1, StaleSeconds.GetInt());

    if (requestState == RS_REQUEST_NONE && (lastRequestSeconds == 0 || nowSeconds - lastRequestSeconds >= refreshSeconds))
    {
        const SCString baseUrl = CleanBaseUrl(ServiceUrl.GetString());
        SCString url;
        if (requestType == RS_REQUEST_STATUS)
        {
            url.Format("%s/levels/%s?format=sierra", baseUrl.GetChars(), Symbol.GetString());
            requestType = RS_REQUEST_LEVELS;
        }
        else
        {
            url.Format("%s/status", baseUrl.GetChars());
            requestType = RS_REQUEST_STATUS;
        }

        sc.HTTPResponse = "";
        sc.MakeHTTPRequest(url);
        requestState = requestType;
        lastRequestSeconds = nowSeconds;
    }

    if (requestState != RS_REQUEST_NONE && sc.HTTPResponse.GetLength() > 0)
    {
        if (requestState == RS_REQUEST_STATUS)
        {
            sourceState = FindSourceState(sc.HTTPResponse).c_str();
        }
        else if (requestState == RS_REQUEST_LEVELS)
        {
            const std::vector<RsLevel> levels = ParseLevelsText(sc.HTTPResponse);
            for (int i = 0; i < static_cast<int>(levels.size()); ++i)
                DrawLevel(sc, levels[i], i, LineWidth.GetInt(), ShowLabels.GetYesNo() != 0);
            DeleteUnusedDrawings(sc, static_cast<int>(levels.size()));
            lastLevelsSeconds = nowSeconds;
        }

        requestState = RS_REQUEST_NONE;
        sc.HTTPResponse = "";
    }

    COLORREF statusColor = RGB(160, 160, 160);
    SCString statusText;
    if (lastLevelsSeconds == 0)
    {
        statusText = "RS Levels waiting";
    }
    else if (nowSeconds - lastLevelsSeconds > staleSeconds || sourceState == "stale")
    {
        statusText.Format("RS Levels stale (%s)", sourceState.GetChars());
        statusColor = RGB(255, 152, 0);
    }
    else
    {
        statusText.Format("RS Levels live (%s)", sourceState.GetLength() ? sourceState.GetChars() : "unknown");
        statusColor = RGB(76, 175, 80);
    }
    DrawStatus(sc, statusText.GetChars(), statusColor);
}
