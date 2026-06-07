using System.Text.Json;

namespace eln.Backend.Application.Services;

/// <summary>
/// Evaluates calculated template fields based on simple +,-,*,/ formulas with parentheses.
/// Tokens use the same shape as the Angular frontend.
/// </summary>
public static class FormulaEvaluator
{
    private static readonly Dictionary<string, int> Precedence = new()
    {
        ["+"] = 1,
        ["-"] = 1,
        ["*"] = 2,
        ["/"] = 2
    };

    public record FieldToken(string Kind, string? Op = null, double? Value = null, string? FieldName = null);

    /// <summary>
    /// Walks a template schema (UI or backend format), finds all calculated fields,
    /// evaluates their formulas and writes the result back into the measurement data document.
    /// Replaces whatever the client may have sent. If a referenced field is missing or null,
    /// the calculated field is set to null.
    /// </summary>
    public static JsonDocument EvaluateCalculatedFields(JsonDocument schema, JsonDocument data)
    {
        var dataDict = JsonElementToDict(data.RootElement);
        var fields = ExtractCalculatedFields(schema);

        foreach (var (sectionTitle, fieldName, tokens) in fields)
        {
            double? result = Evaluate(tokens, (refFieldName) =>
                LookupNumericValue(dataDict, refFieldName));

            if (!dataDict.ContainsKey(sectionTitle))
            {
                dataDict[sectionTitle] = new Dictionary<string, object?>();
            }
            var section = (Dictionary<string, object?>)dataDict[sectionTitle]!;
            section[fieldName] = result.HasValue ? (object)result.Value : null;
        }

        var json = JsonSerializer.Serialize(dataDict);
        return JsonDocument.Parse(json);
    }

    private static double? LookupNumericValue(Dictionary<string, object?> data, string fieldName)
    {
        foreach (var section in data.Values)
        {
            if (section is Dictionary<string, object?> sectionDict)
            {
                if (sectionDict.TryGetValue(fieldName, out var raw) && raw is not null)
                {
                    if (raw is double d) return d;
                    if (raw is long l) return l;
                    if (raw is int i) return i;
                    if (raw is decimal dec) return (double)dec;
                    if (raw is string s)
                    {
                        if (double.TryParse(s.Replace(",", "."),
                            System.Globalization.NumberStyles.Float,
                            System.Globalization.CultureInfo.InvariantCulture, out var parsed))
                            return parsed;
                    }
                }
            }
        }
        return null;
    }

    private static List<(string SectionTitle, string FieldName, List<FieldToken> Tokens)> ExtractCalculatedFields(JsonDocument schema)
    {
        var result = new List<(string, string, List<FieldToken>)>();
        JsonElement sectionsElement;

        if (schema.RootElement.ValueKind == JsonValueKind.Array)
            sectionsElement = schema.RootElement;
        else if (schema.RootElement.TryGetProperty("sections", out var prop))
            sectionsElement = prop;
        else
            return result;

        // Map fieldId -> backendName for reference resolution
        var fieldIdToName = BuildFieldIdMap(sectionsElement);

        foreach (var section in sectionsElement.EnumerateArray())
        {
            var sectionTitle = TryGetString(section, "title", "Title", "name", "Name") ?? "Sektion";

            // UI format: cards[].fields[]
            if (section.TryGetProperty("cards", out var cards))
            {
                foreach (var card in cards.EnumerateArray())
                {
                    var cardTitle = TryGetString(card, "title", "Title") ?? "Bereich";
                    if (!card.TryGetProperty("fields", out var fields)) continue;
                    foreach (var field in fields.EnumerateArray())
                    {
                        var type = TryGetString(field, "type", "Type") ?? "";
                        if (!string.Equals(type, "calculated", StringComparison.OrdinalIgnoreCase)) continue;
                        var label = TryGetString(field, "label", "Label") ?? "Feld";
                        var fieldName = $"{cardTitle} - {label}";
                        var tokens = ParseTokens(field, fieldIdToName);
                        result.Add((sectionTitle, fieldName, tokens));
                    }
                }
                continue;
            }

            // Backend format: Fields[]
            if (section.TryGetProperty("Fields", out var backendFields) ||
                section.TryGetProperty("fields", out backendFields))
            {
                foreach (var field in backendFields.EnumerateArray())
                {
                    var type = TryGetString(field, "Type", "type") ?? "";
                    if (!string.Equals(type, "calculated", StringComparison.OrdinalIgnoreCase))
                    {
                        // Could also check UiType
                        var uiType = TryGetString(field, "UiType", "uiType") ?? "";
                        if (!string.Equals(uiType, "calculated", StringComparison.OrdinalIgnoreCase)) continue;
                    }
                    var name = TryGetString(field, "Name", "name") ?? "";
                    if (string.IsNullOrEmpty(name)) continue;
                    var tokens = ParseTokens(field, fieldIdToName);
                    result.Add((sectionTitle, name, tokens));
                }
            }
        }

        return result;
    }

    private static Dictionary<string, string> BuildFieldIdMap(JsonElement sectionsElement)
    {
        var map = new Dictionary<string, string>();
        foreach (var section in sectionsElement.EnumerateArray())
        {
            if (section.TryGetProperty("cards", out var cards))
            {
                foreach (var card in cards.EnumerateArray())
                {
                    var cardTitle = TryGetString(card, "title", "Title") ?? "Bereich";
                    if (!card.TryGetProperty("fields", out var fields)) continue;
                    foreach (var field in fields.EnumerateArray())
                    {
                        var id = TryGetString(field, "id", "Id");
                        var label = TryGetString(field, "label", "Label") ?? "Feld";
                        if (!string.IsNullOrEmpty(id))
                            map[id] = $"{cardTitle} - {label}";
                    }
                }
            }
            else if (section.TryGetProperty("Fields", out var backendFields) ||
                     section.TryGetProperty("fields", out backendFields))
            {
                foreach (var field in backendFields.EnumerateArray())
                {
                    var id = TryGetString(field, "id", "Id");
                    var name = TryGetString(field, "Name", "name");
                    if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(name))
                        map[id] = name;
                }
            }
        }
        return map;
    }

    private static List<FieldToken> ParseTokens(JsonElement field, Dictionary<string, string> fieldIdToName)
    {
        var tokens = new List<FieldToken>();
        if (!field.TryGetProperty("formula", out var formulaElement) &&
            !field.TryGetProperty("Formula", out formulaElement))
            return tokens;

        if (formulaElement.ValueKind != JsonValueKind.Array) return tokens;

        foreach (var tokenEl in formulaElement.EnumerateArray())
        {
            var kind = TryGetString(tokenEl, "kind", "Kind") ?? "";
            switch (kind)
            {
                case "operator":
                    var op = TryGetString(tokenEl, "op", "Op");
                    if (op is not null) tokens.Add(new FieldToken("operator", Op: op));
                    break;
                case "number":
                    if (tokenEl.TryGetProperty("value", out var v) || tokenEl.TryGetProperty("Value", out v))
                    {
                        if (v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d))
                            tokens.Add(new FieldToken("number", Value: d));
                    }
                    break;
                case "field":
                    var fieldId = TryGetString(tokenEl, "fieldId", "FieldId");
                    if (fieldId is not null && fieldIdToName.TryGetValue(fieldId, out var fname))
                        tokens.Add(new FieldToken("field", FieldName: fname));
                    break;
            }
        }
        return tokens;
    }

    public static double? Evaluate(List<FieldToken> tokens, Func<string, double?> resolveField)
    {
        if (tokens.Count == 0) return null;

        var output = new Stack<double?>();
        var ops = new Stack<string>();

        foreach (var t in tokens)
        {
            switch (t.Kind)
            {
                case "number":
                    output.Push(t.Value);
                    break;
                case "field":
                    output.Push(t.FieldName is not null ? resolveField(t.FieldName) : null);
                    break;
                case "operator":
                    var op = t.Op ?? "";
                    if (op == "(") ops.Push(op);
                    else if (op == ")")
                    {
                        while (ops.Count > 0 && ops.Peek() != "(")
                        {
                            if (!ApplyOp(output, ops.Pop())) return null;
                        }
                        if (ops.Count > 0) ops.Pop();
                    }
                    else
                    {
                        while (ops.Count > 0 && ops.Peek() != "(" &&
                               Precedence.TryGetValue(ops.Peek(), out var topPrec) &&
                               Precedence.TryGetValue(op, out var curPrec) &&
                               topPrec >= curPrec)
                        {
                            if (!ApplyOp(output, ops.Pop())) return null;
                        }
                        ops.Push(op);
                    }
                    break;
            }
        }

        while (ops.Count > 0)
        {
            if (!ApplyOp(output, ops.Pop())) return null;
        }

        if (output.Count != 1) return null;
        var result = output.Pop();
        if (!result.HasValue || double.IsNaN(result.Value) || double.IsInfinity(result.Value)) return null;
        return result;
    }

    private static bool ApplyOp(Stack<double?> stack, string op)
    {
        if (stack.Count < 2) return false;
        var b = stack.Pop();
        var a = stack.Pop();
        if (!a.HasValue || !b.HasValue) { stack.Push(null); return true; }
        switch (op)
        {
            case "+": stack.Push(a + b); return true;
            case "-": stack.Push(a - b); return true;
            case "*": stack.Push(a * b); return true;
            case "/":
                if (b == 0) { stack.Push(null); return true; }
                stack.Push(a / b); return true;
            default: return false;
        }
    }

    private static Dictionary<string, object?> JsonElementToDict(JsonElement element)
    {
        var dict = new Dictionary<string, object?>();
        if (element.ValueKind != JsonValueKind.Object) return dict;
        foreach (var prop in element.EnumerateObject())
        {
            dict[prop.Name] = ConvertJsonValue(prop.Value);
        }
        return dict;
    }

    private static object? ConvertJsonValue(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Object:
                var d = new Dictionary<string, object?>();
                foreach (var p in el.EnumerateObject()) d[p.Name] = ConvertJsonValue(p.Value);
                return d;
            case JsonValueKind.Array:
                var list = new List<object?>();
                foreach (var item in el.EnumerateArray()) list.Add(ConvertJsonValue(item));
                return list;
            case JsonValueKind.String: return el.GetString();
            case JsonValueKind.Number:
                if (el.TryGetInt64(out var l)) return l;
                if (el.TryGetDouble(out var dnum)) return dnum;
                return null;
            case JsonValueKind.True: return true;
            case JsonValueKind.False: return false;
            default: return null;
        }
    }

    private static string? TryGetString(JsonElement element, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            if (element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
                return prop.GetString();
        }
        return null;
    }
}
