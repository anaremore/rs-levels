#include "sierrachart.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>
#include <vector>

SCDLLName("RS Levels Display")

namespace
{
constexpr const char* RS_SIERRA_BUILD = "sierra-feed-2026-06-21.1";
constexpr int RS_MAX_LEVELS = 500;
constexpr int RS_LINE_BASE = 730000;
constexpr int RS_LABEL_BASE = 731000;
constexpr int RS_STATUS_LINE = 732000;
constexpr int RS_ZONE_BASE = 733000;
constexpr int RS_STATS_LINE = 734000;
constexpr int RS_DEBUG_LINE = 735000;
constexpr int RS_REQUEST_NONE = 0;
constexpr int RS_REQUEST_FEED = 1;
constexpr int RS_HTTP_TIMEOUT_SEC = 10;

struct RsLevel
{
    std::string name;
    double price = 0.0;
    int red = 158;
    int green = 158;
    int blue = 158;
    std::string kind = "unknown";
};

struct DisplayColors
{
    COLORREF dd;
    COLORREF hp;
    COLORREF mhp;
    COLORREF openClose;
    COLORREF reference;
    COLORREF yellowLine;
    COLORREF redLine;
    COLORREF cat;
    COLORREF bullZone;
    COLORREF bearZone;
    COLORREF other;
};

void DisableToolAutoLabels(s_UseTool& tool)
{
    tool.DisplayHorizontalLineValue = 0;
    tool.ShowTickDifference = 0;
    tool.ShowCurrencyValue = 0;
    tool.ShowPriceDifference = 0;
    tool.ShowPercentChange = 0;
    tool.ShowTimeDifference = 0;
    tool.ShowNumberOfBars = 0;
    tool.ShowAngle = 0;
    tool.ShowEndPointPrice = 0;
    tool.ShowEndPointDateTime = 0;
    tool.ShowEndPointDate = 0;
    tool.ShowEndPointTime = 0;
    tool.ShowPercent = 0;
    tool.ShowPrice = 0;
    tool.ShowVolume = 0;
    tool.ShowLabels = 0;
    tool.ShowLabelsAtEnd = 0;
    tool.ShowBeginMark = 0;
    tool.ShowEndMark = 0;
    tool.ClearExistingText = 1;
}

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
    if (parsed < 0)
        return 0;
    if (parsed > 255)
        return 255;
    return parsed;
}

int AtLeast(int minimum, int value)
{
    return value < minimum ? minimum : value;
}

double HigherPrice(double first, double second)
{
    return first > second ? first : second;
}

double LowerPrice(double first, double second)
{
    return first < second ? first : second;
}

int ClampPercent(int value, int minimum, int maximum)
{
    if (value < minimum)
        return minimum;
    if (value > maximum)
        return maximum;
    return value;
}

std::string ResponseShape(const SCString& body)
{
    const char* text = body.GetChars();
    if (text == nullptr)
        return "empty";

    for (int i = 0; text[i] != 0; ++i)
    {
        const unsigned char ch = static_cast<unsigned char>(text[i]);
        if (std::isspace(ch))
            continue;
        if (ch == '{' || ch == '[')
            return "json";
        if (std::isprint(ch))
            return std::string("text:") + static_cast<char>(ch);
        return "binary";
    }
    return "blank";
}

int CountNonBlankRows(const SCString& body)
{
    int count = 0;
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row))
    {
        if (!Trim(row).empty())
            ++count;
    }
    return count;
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

std::string FormatMetric(const std::string& value)
{
    char* end = nullptr;
    const double parsed = std::strtod(value.c_str(), &end);
    if (end == value.c_str())
        return value;
    char buffer[32] = {};
    std::snprintf(buffer, sizeof(buffer), "%.2f", parsed);
    std::string text(buffer);
    while (text.size() > 1 && text.find('.') != std::string::npos && text[text.size() - 1] == '0')
        text.pop_back();
    if (!text.empty() && text[text.size() - 1] == '.')
        text.pop_back();
    return text;
}

void AssignStat(const std::string& name, const std::string& value, std::string& dd, std::string& ri, std::string& res, std::string& mres, std::string& wres, std::string& map)
{
    const std::string upper = Upper(name);
    if (upper == "MAP" || upper == "MAPCODE")
        map = value;
    else if (upper == "DD")
        dd = FormatMetric(value);
    else if (upper == "RI" || upper == "RISKINTERVAL" || upper == "RISK INTERVAL")
        ri = FormatMetric(value);
    else if (upper == "RES")
        res = FormatMetric(value);
    else if (upper == "MRES")
        mres = FormatMetric(value);
    else if (upper == "WRES")
        wres = FormatMetric(value);
}

std::string AppendStatText(const std::string& text, const char* name, const std::string& value)
{
    if (value.empty())
        return text;
    return text.empty() ? std::string(name) + " " + value : text + "  " + name + " " + value;
}

std::string DisplaySymbol(const char* input)
{
    const std::string upper = Upper(input ? input : "");
    return upper.find("NQ") != std::string::npos ? "NQ" : "ES";
}

SCString FormatStatsText(const SCString& body, const char* symbol)
{
    std::string dd;
    std::string ri;
    std::string res;
    std::string mres;
    std::string wres;
    std::string map;
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row))
    {
        std::vector<std::string> fields;
        std::stringstream rowStream(row);
        std::string field;
        while (std::getline(rowStream, field, ','))
            fields.push_back(Trim(field));
        if (fields.size() >= 2)
            AssignStat(fields[0], fields[1], dd, ri, res, mres, wres, map);
    }

    std::string values;
    values = AppendStatText(values, "DD", dd);
    values = AppendStatText(values, "RI", ri);
    values = AppendStatText(values, "Res", res);
    values = AppendStatText(values, "MRes", mres);
    values = AppendStatText(values, "WRes", wres);
    if (map.empty() && values.empty())
        return "";

    std::string text = "RS Levels " + DisplaySymbol(symbol);
    if (!map.empty())
        text += "  Map " + map;
    if (!values.empty())
        text += "\n" + values;
    return text.c_str();
}

std::string FindFeedSourceState(const SCString& body)
{
    std::stringstream stream(body.GetChars());
    std::string row;
    while (std::getline(stream, row))
    {
        std::vector<std::string> fields;
        std::stringstream rowStream(row);
        std::string field;
        while (std::getline(rowStream, field, ','))
            fields.push_back(Trim(field));
        if (fields.size() >= 2 && Upper(fields[0]) == "STATE")
            return fields[1];
    }
    return "unknown";
}

void DrawStationaryText(SCStudyInterfaceRef sc, int lineNumber, const char* text, COLORREF color, int x, int y, int fontSize)
{
    if (text == nullptr || text[0] == '\0')
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, lineNumber);
        return;
    }

    s_UseTool tool;
    tool.Clear();
    tool.ChartNumber = sc.ChartNumber;
    tool.DrawingType = DRAWING_STATIONARY_TEXT;
    tool.LineNumber = lineNumber;
    tool.AddMethod = UTAM_ADD_OR_ADJUST;
    tool.Region = sc.GraphRegion;
    tool.BeginValue = y;
    tool.BeginDateTime = x;
    tool.UseRelativeVerticalValues = 1;
    tool.Color = color;
    tool.FontSize = fontSize;
    tool.Text = text;
    sc.UseTool(tool);
}

void DrawStatus(SCStudyInterfaceRef sc, const char* text, COLORREF color)
{
    DrawStationaryText(sc, RS_STATUS_LINE, text, color, 5, 5, 10);
}

void DrawStats(SCStudyInterfaceRef sc, const char* text)
{
    DrawStationaryText(sc, RS_STATS_LINE, text, RGB(255, 255, 255), 5, 92, 10);
}

void DrawDebug(SCStudyInterfaceRef sc, const char* text, bool show)
{
    if (!show)
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_DEBUG_LINE);
        return;
    }
    DrawStationaryText(sc, RS_DEBUG_LINE, text, RGB(179, 229, 252), 5, 10, 9);
}

bool IsZone(const std::string& kind)
{
    return kind == "zone" || kind == "zone-bull" || kind == "zone-bear";
}

COLORREF LevelColor(const RsLevel& level, const DisplayColors& colors)
{
    if (level.kind == "dd-band")
        return colors.dd;
    if (level.kind == "hp")
        return colors.hp;
    if (level.kind == "mhp")
        return colors.mhp;
    if (level.kind == "open-close")
        return colors.openClose;
    if (level.kind == "reference")
        return colors.reference;
    if (level.kind == "yellow-line")
        return colors.yellowLine;
    if (level.kind == "red-line")
        return colors.redLine;
    if (level.kind == "cat")
        return colors.cat;
    if (level.kind == "zone-bull")
        return colors.bullZone;
    if (level.kind == "zone-bear")
        return colors.bearZone;
    return colors.other;
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

void DrawLevel(SCStudyInterfaceRef sc, const RsLevel& level, int index, int lineWidth, bool showLabels, int labelOffsetTicks, const DisplayColors& colors)
{
    const int lineNumber = RS_LINE_BASE + index;
    const COLORREF color = LevelColor(level, colors);
    const int endIndex = AtLeast(0, sc.ArraySize - 1);

    s_UseTool lineTool;
    lineTool.Clear();
    lineTool.ChartNumber = sc.ChartNumber;
    lineTool.DrawingType = DRAWING_LINE;
    lineTool.LineNumber = lineNumber;
    lineTool.AddMethod = UTAM_ADD_OR_ADJUST;
    lineTool.Region = sc.GraphRegion;
    lineTool.BeginIndex = 0;
    lineTool.EndIndex = endIndex;
    lineTool.BeginValue = static_cast<float>(level.price);
    lineTool.EndValue = static_cast<float>(level.price);
    lineTool.Color = color;
    lineTool.LineWidth = static_cast<unsigned short>(lineWidth);
    lineTool.LineStyle = LINESTYLE_SOLID;
    DisableToolAutoLabels(lineTool);
    sc.UseTool(lineTool);

    if (!showLabels)
    {
        sc.DeleteACSChartDrawing(sc.ChartNumber, TOOL_DELETE_CHARTDRAWING, RS_LABEL_BASE + index);
        return;
    }

    SCString label;
    label.Format("%s %.2f", DisplayLabel(level).c_str(), level.price);
    const float tick = sc.TickSize > 0.0f ? sc.TickSize : 0.01f;
    const float labelOffset = tick * static_cast<float>(AtLeast(1, labelOffsetTicks)) * static_cast<float>(LabelDirection(level));

    s_UseTool labelTool;
    labelTool.Clear();
    labelTool.ChartNumber = sc.ChartNumber;
    labelTool.DrawingType = DRAWING_TEXT;
    labelTool.LineNumber = RS_LABEL_BASE + index;
    labelTool.AddMethod = UTAM_ADD_OR_ADJUST;
    labelTool.Region = sc.GraphRegion;
    labelTool.BeginDateTime = -2;
    labelTool.BeginValue = static_cast<float>(level.price) + labelOffset;
    labelTool.Color = color;
    labelTool.FontSize = 9;
    labelTool.FontBold = 1;
    labelTool.TransparentLabelBackground = 1;
    DisableToolAutoLabels(labelTool);
    labelTool.Text = label;
    sc.UseTool(labelTool);
}

void DrawZoneFill(SCStudyInterfaceRef sc, const RsLevel& first, const RsLevel& second, int index, int opacityPercent, const DisplayColors& colors)
{
    const double top = HigherPrice(first.price, second.price);
    const double bottom = LowerPrice(first.price, second.price);
    const COLORREF color = LevelColor(first, colors);
    const int endIndex = AtLeast(0, sc.ArraySize - 1);

    s_UseTool tool;
    tool.Clear();
    tool.ChartNumber = sc.ChartNumber;
    tool.DrawingType = DRAWING_RECTANGLEHIGHLIGHT;
    tool.LineNumber = RS_ZONE_BASE + index;
    tool.AddMethod = UTAM_ADD_OR_ADJUST;
    tool.Region = sc.GraphRegion;
    tool.BeginIndex = 0;
    tool.EndIndex = endIndex;
    tool.BeginValue = static_cast<float>(top);
    tool.EndValue = static_cast<float>(bottom);
    tool.Color = color;
    tool.SecondaryColor = color;
    tool.TransparencyLevel = 100 - ClampPercent(opacityPercent, 0, 50);
    sc.UseTool(tool);
}

int DrawZoneFills(SCStudyInterfaceRef sc, const std::vector<RsLevel>& levels, bool showZoneFills, int opacityPercent, const DisplayColors& colors)
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
                DrawZoneFill(sc, bullTop, bullBottom, nextIndex++, opacityPercent, colors);
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
                DrawZoneFill(sc, bearTop, bearBottom, nextIndex++, opacityPercent, colors);
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
                DrawZoneFill(sc, zoneTop, zoneBottom, nextIndex++, opacityPercent, colors);
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
    SCInputRef DdColor = sc.Input[9];
    SCInputRef HpColor = sc.Input[10];
    SCInputRef MhpColor = sc.Input[11];
    SCInputRef OpenCloseColor = sc.Input[12];
    SCInputRef ReferenceColor = sc.Input[13];
    SCInputRef YellowLineColor = sc.Input[14];
    SCInputRef RedLineColor = sc.Input[15];
    SCInputRef CatColor = sc.Input[16];
    SCInputRef BullZoneColor = sc.Input[17];
    SCInputRef BearZoneColor = sc.Input[18];
    SCInputRef OtherColor = sc.Input[19];
    SCInputRef ShowDebugStatus = sc.Input[20];

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

        DdColor.Name = "DD band color";
        DdColor.SetColor(RGB(0, 188, 212));

        HpColor.Name = "HP color";
        HpColor.SetColor(RGB(41, 98, 255));

        MhpColor.Name = "MHP color";
        MhpColor.SetColor(RGB(255, 152, 0));

        OpenCloseColor.Name = "Open/close color";
        OpenCloseColor.SetColor(RGB(255, 255, 255));

        ReferenceColor.Name = "Reference color";
        ReferenceColor.SetColor(RGB(255, 235, 59));

        YellowLineColor.Name = "Yellow line color";
        YellowLineColor.SetColor(RGB(255, 235, 59));

        RedLineColor.Name = "Red line color";
        RedLineColor.SetColor(RGB(242, 54, 69));

        CatColor.Name = "CAT color";
        CatColor.SetColor(RGB(126, 87, 194));

        BullZoneColor.Name = "Bull zone color";
        BullZoneColor.SetColor(RGB(76, 175, 80));

        BearZoneColor.Name = "Bear zone color";
        BearZoneColor.SetColor(RGB(240, 98, 146));

        OtherColor.Name = "Other level color";
        OtherColor.SetColor(RGB(158, 158, 158));

        ShowDebugStatus.Name = "Show debug status";
        ShowDebugStatus.SetYesNo(0);

        return;
    }

    int& requestState = sc.GetPersistentInt(1);
    int& lastRequestSeconds = sc.GetPersistentInt(3);
    int& lastLevelsSeconds = sc.GetPersistentInt(4);
    int& lastLevelCount = sc.GetPersistentInt(5);
    SCString& sourceState = sc.GetPersistentSCString(1);
    SCString& statsText = sc.GetPersistentSCString(2);
    SCString& lastIssue = sc.GetPersistentSCString(3);
    SCString& lastRequestPath = sc.GetPersistentSCString(4);
    SCString& lastFeedDebug = sc.GetPersistentSCString(5);

    const int nowSeconds = sc.CurrentSystemDateTime.GetTimeInSeconds();
    const int refreshSeconds = AtLeast(1, RefreshMs.GetInt() / 1000);
    const int staleSeconds = AtLeast(1, StaleSeconds.GetInt());
    const DisplayColors colors = {
        DdColor.GetColor(),
        HpColor.GetColor(),
        MhpColor.GetColor(),
        OpenCloseColor.GetColor(),
        ReferenceColor.GetColor(),
        YellowLineColor.GetColor(),
        RedLineColor.GetColor(),
        CatColor.GetColor(),
        BullZoneColor.GetColor(),
        BearZoneColor.GetColor(),
        OtherColor.GetColor()
    };

    if (lastRequestSeconds > 0 && nowSeconds < lastRequestSeconds)
    {
        requestState = RS_REQUEST_NONE;
        lastRequestSeconds = 0;
    }

    if (requestState == RS_REQUEST_NONE && (lastRequestSeconds == 0 || nowSeconds - lastRequestSeconds >= refreshSeconds))
    {
        const SCString baseUrl = CleanBaseUrl(ServiceUrl.GetString());
        SCString path;
        SCString url;
        path.Format("/sierra/%s", Symbol.GetString());
        url.Format("%s%s", baseUrl.GetChars(), path.GetChars());

        sc.HTTPResponse = "";
        sc.MakeHTTPRequest(url);
        requestState = RS_REQUEST_FEED;
        lastRequestPath = path;
        lastFeedDebug.Format("feed pending %s", lastRequestPath.GetChars());
        lastRequestSeconds = nowSeconds;
    }

    if (requestState != RS_REQUEST_NONE && sc.HTTPResponse.GetLength() == 0 && nowSeconds - lastRequestSeconds >= RS_HTTP_TIMEOUT_SEC)
    {
        lastIssue = "HTTP timeout";
        lastFeedDebug.Format("feed timeout %s", lastRequestPath.GetChars());
        requestState = RS_REQUEST_NONE;
        sc.HTTPResponse = "";
    }

    if (requestState != RS_REQUEST_NONE && sc.HTTPResponse.GetLength() > 0)
    {
        const int responseLength = sc.HTTPResponse.GetLength();
        const int rawRowCount = CountNonBlankRows(sc.HTTPResponse);
        const std::string shape = ResponseShape(sc.HTTPResponse);
        if (requestState == RS_REQUEST_FEED)
        {
            sourceState = FindFeedSourceState(sc.HTTPResponse).c_str();
            const std::vector<RsLevel> levels = ParseLevelsText(sc.HTTPResponse);
            const int zoneCount = DrawZoneFills(sc, levels, ShowZoneFills.GetYesNo() != 0, ZoneFillOpacity.GetInt(), colors);
            for (int i = 0; i < static_cast<int>(levels.size()); ++i)
                DrawLevel(sc, levels[i], i, LineWidth.GetInt(), ShowLabels.GetYesNo() != 0, LabelOffsetTicks.GetInt(), colors);
            DeleteUnusedDrawings(sc, static_cast<int>(levels.size()), zoneCount);
            statsText = FormatStatsText(sc.HTTPResponse, Symbol.GetString());
            lastLevelsSeconds = nowSeconds;
            lastLevelCount = static_cast<int>(levels.size());
            lastFeedDebug.Format("feed %s len=%d rows=%d parsed=%d shape=%s state=%s", lastRequestPath.GetChars(), responseLength, rawRowCount, lastLevelCount, shape.c_str(), sourceState.GetChars());
        }

        requestState = RS_REQUEST_NONE;
        lastIssue = "";
        sc.HTTPResponse = "";
    }

    COLORREF statusColor = RGB(160, 160, 160);
    SCString statusText;
    if (lastLevelsSeconds == 0)
    {
        if (lastIssue.GetLength())
            statusText = lastIssue;
        else
            statusText = "RS Levels waiting";
    }
    else if (lastIssue.GetLength())
    {
        statusText.Format("RS Levels issue (%s, %d rows)", lastIssue.GetChars(), lastLevelCount);
        statusColor = RGB(242, 54, 69);
    }
    else if (nowSeconds - lastLevelsSeconds > staleSeconds || sourceState == "stale")
    {
        statusText.Format("RS Levels stale (%s, %d rows)", sourceState.GetChars(), lastLevelCount);
        statusColor = RGB(255, 152, 0);
    }
    else
    {
        statusText.Format("RS Levels live (%s, %d rows)", sourceState.GetLength() ? sourceState.GetChars() : "unknown", lastLevelCount);
        statusColor = RGB(76, 175, 80);
    }
    DrawStatus(sc, statusText.GetChars(), statusColor);
    DrawStats(sc, statsText.GetChars());

    std::string debugLine;
    if (lastFeedDebug.GetLength())
        debugLine += lastFeedDebug.GetChars();
    if (!debugLine.empty())
        debugLine += " | ";
    debugLine += "build=";
    debugLine += RS_SIERRA_BUILD;
    DrawDebug(sc, debugLine.c_str(), ShowDebugStatus.GetYesNo() != 0);
}
