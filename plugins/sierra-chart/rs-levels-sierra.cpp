#include "sierrachart.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>

SCDLLName("RS Levels Display")

namespace
{
constexpr int RS_MAX_LEVELS = 500;
constexpr int RS_LINE_BASE = 730000;
constexpr int RS_LABEL_BASE = 731000;
constexpr int RS_STATUS_LINE = 732000;
constexpr int RS_ZONE_BASE = 733000;
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
    std::string kind = "unknown";
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

std::string Upper(std::string value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    return value;
}

std::string ReplaceAll(std::string value, const std::string& needle, const std::string& replacement)
{
    size_t position = 0;
    while ((position = value.find(needle, position)) != std::string::npos)
    {
        value.replace(position, needle.size(), replacement);
        position += replacement.size();
    }
    return value;
}

std::string InferKind(const std::string& name)
{
    const std::string upper = Upper(name);
    if (upper.find("MHP") != std::string::npos) return "mhp";
    if (upper.find("HP") != std::string::npos) return "hp";
    if (upper.find("DD") != std::string::npos) return "dd-band";
    if (upper.find("BRZ") != std::string::npos || upper.find("BEAR") != std::string::npos) return "zone-bear";
    if (upper.find("BZ") != std::string::npos || upper.find("BULL") != std::string::npos) return "zone-bull";
    if (upper.find("ZONE") != std::string::npos) return "zone";
    if (upper.find("CAT") != std::string::npos) return "cat";
    if (upper.find("YELLOW LINE") != std::string::npos || upper == "YL") return "yellow-line";
    if (upper.find("RED LINE") != std::string::npos || upper == "RL") return "red-line";
    if (upper.find("OPEN") != std::string::npos || upper.find("CLOSE") != std::string::npos || upper.find("GAP") != std::string::npos) return "open-close";
    return "unknown";
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
    out.kind = fields.size() >= 6 ? fields[5] : "";
    if (out.kind.empty())
        out.kind = InferKind(fields[0]);
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

bool IsZone(const std::string& kind)
{
    return kind == "zone" || kind == "zone-bull" || kind == "zone-bear";
}

int ZoneBoundarySide(const std::string& name)
{
    const std::string upper = Upper(name);
    if (upper.find("TOP") != std::string::npos || upper.find("UPPER") != std::string::npos || upper.find("BZT") != std::string::npos || upper.find("BRZT") != std::string::npos)
        return 1;
    if (upper.find("BOTTOM") != std::string::npos || upper.find("LOWER") != std::string::npos || upper.find("BZB") != std::string::npos || upper.find("BRZB") != std::string::npos)
        return -1;
    return 0;
}

int LabelDirection(const RsLevel& level)
{
    const std::string upper = Upper(level.name);
    if (upper.find("LOWER") != std::string::npos || upper.find("BZB") != std::string::npos || upper.find("BRZB") != std::string::npos)
        return -1;
    if (upper.find("UPPER") != std::string::npos || upper.find("BZT") != std::string::npos || upper.find("BRZT") != std::string::npos)
        return 1;
    if (level.kind == "mhp" || level.kind == "zone-bull" || level.kind == "dd-band")
        return -1;
    return 1;
}

std::string DisplayLabel(const RsLevel& level)
{
    const std::string upper = Upper(level.name);
    if (upper.find("PREVDAYCLOSE") != std::string::npos || upper.find("PREV DAY CLOSE") != std::string::npos)
        return "Prev Close";
    if (upper.find("MIDGAP") != std::string::npos || upper.find("HALFGAP") != std::string::npos || upper.find("HALF GAP") != std::string::npos)
        return "Mid Gap";
    if (upper.find("LASTOPEN") != std::string::npos || (upper.find("OPEN") != std::string::npos && upper.find("CLOSE") == std::string::npos))
        return "Open";
    if (upper.find("CLOSE") != std::string::npos)
        return "Close";
    if (upper.find("OVNMHP") != std::string::npos)
        return "OVNMHP";
    if (upper.find("OVNHP") != std::string::npos)
        return "OVNHP";
    if (level.kind == "mhp" || upper.find("MAN_MHP") != std::string::npos || upper.find(" MHP") != std::string::npos)
        return "MHP";
    if (level.kind == "hp" || upper.find("MAN_HP") != std::string::npos || upper.find(" HP") != std::string::npos)
        return "HP";
    if (level.kind == "dd-band" || upper.find("DD") != std::string::npos)
        return "DD";
    if (level.kind == "cat" || upper.find("CAT") != std::string::npos)
        return "CAT";
    if (level.kind == "yellow-line" || upper.find("YELLOW LINE") != std::string::npos || upper == "YL")
        return "Yellow Line";
    if (level.kind == "red-line" || upper.find("RED LINE") != std::string::npos || upper == "RL")
        return "Red Line";

    std::string cleaned = level.name;
    cleaned = ReplaceAll(cleaned, "horizontal_line", "");
    cleaned = ReplaceAll(cleaned, "horizontal_ray", "");
    cleaned = ReplaceAll(cleaned, "horizontal", "");
    cleaned = ReplaceAll(cleaned, "Liquidity Map", "");
    cleaned = ReplaceAll(cleaned, "liq-map-history", "");
    cleaned = ReplaceAll(cleaned, "text", "");
    cleaned = ReplaceAll(cleaned, ":", " ");
    cleaned = Trim(cleaned);
    return cleaned.empty() ? "Level" : cleaned;
}

void DrawLevel(SCStudyInterfaceRef sc, const RsLevel& level, int index, int lineWidth, bool showLabels, int labelOffsetTicks)
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
    label.Format("%s %.2f", DisplayLabel(level).c_str(), level.price);
    const float tick = sc.TickSize > 0.0f ? sc.TickSize : 0.01f;
    const float labelOffset = tick * static_cast<float>(std::max(1, labelOffsetTicks)) * static_cast<float>(LabelDirection(level));

    s_UseTool labelTool;
    labelTool.Clear();
    labelTool.ChartNumber = sc.ChartNumber;
    labelTool.DrawingType = DRAWING_TEXT;
    labelTool.LineNumber = RS_LABEL_BASE + index;
    labelTool.AddMethod = UTAM_ADD_OR_ADJUST;
    labelTool.Region = sc.GraphRegion;
    labelTool.BeginIndex = std::max(0, sc.ArraySize - 1);
    labelTool.BeginValue = static_cast<float>(level.price) + labelOffset;
    labelTool.Color = color;
    labelTool.FontSize = 9;
    labelTool.Text = label;
    sc.UseTool(labelTool);
}

void DrawZoneFill(SCStudyInterfaceRef sc, const RsLevel& first, const RsLevel& second, int index, int opacityPercent)
{
    const double top = std::max(first.price, second.price);
    const double bottom = std::min(first.price, second.price);
    const COLORREF color = RGB(first.red, first.green, first.blue);

    s_UseTool tool;
    tool.Clear();
    tool.ChartNumber = sc.ChartNumber;
    tool.DrawingType = DRAWING_RECTANGLE_EXT_HIGHLIGHT;
    tool.LineNumber = RS_ZONE_BASE + index;
    tool.AddMethod = UTAM_ADD_OR_ADJUST;
    tool.Region = sc.GraphRegion;
    tool.BeginIndex = std::max(0, sc.ArraySize - 2);
    tool.EndIndex = std::max(0, sc.ArraySize - 1);
    tool.BeginValue = static_cast<float>(top);
    tool.EndValue = static_cast<float>(bottom);
    tool.Color = color;
    tool.SecondaryColor = color;
    tool.TransparencyLevel = 100 - std::max(0, std::min(50, opacityPercent));
    sc.UseTool(tool);
}

int DrawZoneFills(SCStudyInterfaceRef sc, const std::vector<RsLevel>& levels, bool showZoneFills, int opacityPercent)
{
    if (!showZoneFills)
        return 0;

    int nextIndex = 0;
    RsLevel bullTop;
    RsLevel bullBottom;
    RsLevel bearTop;
    RsLevel bearBottom;
    RsLevel zoneTop;
    RsLevel zoneBottom;
    bool hasBullTop = false;
    bool hasBullBottom = false;
    bool hasBearTop = false;
    bool hasBearBottom = false;
    bool hasZoneTop = false;
    bool hasZoneBottom = false;

    for (const RsLevel& level : levels)
    {
        if (!IsZone(level.kind))
            continue;

        const int side = ZoneBoundarySide(level.name);
        if (side == 0)
            continue;

        if (level.kind == "zone-bull")
        {
            if (side > 0)
            {
                bullTop = level;
                hasBullTop = true;
            }
            else
            {
                bullBottom = level;
                hasBullBottom = true;
            }
            if (hasBullTop && hasBullBottom && nextIndex < RS_MAX_LEVELS)
            {
                DrawZoneFill(sc, bullTop, bullBottom, nextIndex++, opacityPercent);
                hasBullTop = false;
                hasBullBottom = false;
            }
        }
        else if (level.kind == "zone-bear")
        {
            if (side > 0)
            {
                bearTop = level;
                hasBearTop = true;
            }
            else
            {
                bearBottom = level;
                hasBearBottom = true;
            }
            if (hasBearTop && hasBearBottom && nextIndex < RS_MAX_LEVELS)
            {
                DrawZoneFill(sc, bearTop, bearBottom, nextIndex++, opacityPercent);
                hasBearTop = false;
                hasBearBottom = false;
            }
        }
        else
        {
            if (side > 0)
            {
                zoneTop = level;
                hasZoneTop = true;
            }
            else
            {
                zoneBottom = level;
                hasZoneBottom = true;
            }
            if (hasZoneTop && hasZoneBottom && nextIndex < RS_MAX_LEVELS)
            {
                DrawZoneFill(sc, zoneTop, zoneBottom, nextIndex++, opacityPercent);
                hasZoneTop = false;
                hasZoneBottom = false;
            }
        }
    }

    return nextIndex;
}

void DeleteUnusedDrawings(SCStudyInterfaceRef sc, int usedCount, int usedZoneCount)
{
    for (int i = usedCount; i < RS_MAX_LEVELS; ++i)
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LINE_BASE + i);
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LABEL_BASE + i);
    }
    for (int i = usedZoneCount; i < RS_MAX_LEVELS; ++i)
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_ZONE_BASE + i);
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
    SCInputRef ShowZoneFills = sc.Input[5];
    SCInputRef ZoneFillOpacity = sc.Input[6];
    SCInputRef LabelOffsetTicks = sc.Input[7];
    SCInputRef LineWidth = sc.Input[8];

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

        ShowZoneFills.Name = "Show zone fills";
        ShowZoneFills.SetYesNo(1);

        ZoneFillOpacity.Name = "Zone fill opacity percent";
        ZoneFillOpacity.SetInt(12);
        ZoneFillOpacity.SetIntLimits(0, 50);

        LabelOffsetTicks.Name = "Label offset ticks";
        LabelOffsetTicks.SetInt(2);
        LabelOffsetTicks.SetIntLimits(1, 100);

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
            url.Format("%s/levels/%s?format=rows", baseUrl.GetChars(), Symbol.GetString());
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
            const int zoneCount = DrawZoneFills(sc, levels, ShowZoneFills.GetYesNo() != 0, ZoneFillOpacity.GetInt());
            for (int i = 0; i < static_cast<int>(levels.size()); ++i)
                DrawLevel(sc, levels[i], i, LineWidth.GetInt(), ShowLabels.GetYesNo() != 0, LabelOffsetTicks.GetInt());
            DeleteUnusedDrawings(sc, static_cast<int>(levels.size()), zoneCount);
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
