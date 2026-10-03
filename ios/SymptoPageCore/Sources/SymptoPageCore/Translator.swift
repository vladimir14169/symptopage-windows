// EN/PL texts shared with Windows: i18n.json is exported from core/i18n.js
// (`pnpm export:i18n`). Same keys, {placeholders} and plural categories.
import Foundation

public struct Translator: Sendable {
    enum Value: Decodable, Sendable {
        case text(String), plural([String: String])
        init(from d: Decoder) throws {
            let c = try d.singleValueContainer()
            if let s = try? c.decode(String.self) { self = .text(s) } else { self = .plural(try c.decode([String: String].self)) }
        }
    }
    let table: [String: [String: Value]]
    public var language: String

    public init(json: Data, language: String) throws {
        table = try JSONDecoder().decode([String: [String: Value]].self, from: json)
        self.language = language
    }

    /// CLDR plural category for integers (English and Polish only).
    public static func category(_ language: String, _ n: Int) -> String {
        if language == "pl" {
            if n == 1 { return "one" }
            let m10 = n % 10, m100 = n % 100
            return (2...4).contains(m10) && !(12...14).contains(m100) ? "few" : "many"
        }
        return n == 1 ? "one" : "other"
    }

    public func t(_ key: String, _ vars: [String: CustomStringConvertible] = [:]) -> String {
        guard let v = table[language == "pl" ? "pl" : "en"]?[key] else { return key }
        var s: String
        switch v {
        case .text(let x): s = x
        case .plural(let forms):
            let n = (vars["n"] as? Int) ?? Int("\(vars["n"] ?? 0)") ?? 0
            s = forms[Translator.category(language, n)] ?? forms["other"] ?? key
        }
        for (k, val) in vars { s = s.replacingOccurrences(of: "{\(k)}", with: val.description) }
        return s
    }

    public var keys: Set<String> { Set(table["en"]?.keys.map { $0 } ?? []) }
    public func hasKey(_ key: String, language: String) -> Bool { table[language]?[key] != nil }
}
