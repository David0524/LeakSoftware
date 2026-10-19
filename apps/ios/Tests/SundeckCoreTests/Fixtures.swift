import Foundation
import SundeckCore
import Testing

/// One run of a TypeScript rule, from apps/ios/Tests/Fixtures/<module>.json
/// (`pnpm --filter @leakbook/ios fixtures` writes them; docs/plans/swift-app.md).
struct FixtureCase: Decodable, CustomStringConvertible {
    let args: [JSONValue]
    let result: JSONValue?
    let `throws`: String?

    var description: String {
        let data = (try? JSONEncoder().encode(args)) ?? Data()
        return "args \(String(decoding: data, as: UTF8.self))"
    }

    /// Argument `index` decoded as `T` (JSON null for a missing argument).
    func arg<T: Decodable>(_ index: Int, as type: T.Type = T.self) throws -> T {
        try args.indices.contains(index) ? args[index].decode(T.self) : JSONValue.null.decode(T.self)
    }
}

enum Fixtures {
    nonisolated(unsafe) private static var loaded: [String: [String: [FixtureCase]]] = [:]
    private static let lock = NSLock()

    private static func load(_ module: String) -> [String: [FixtureCase]] {
        lock.withLock {
            if let cached = loaded[module] { return cached }
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .appendingPathComponent("../Fixtures/\(module).json")
                .standardized
            let decoded =
                (try? JSONDecoder().decode([String: [FixtureCase]].self, from: Data(contentsOf: url))) ?? [:]
            loaded[module] = decoded
            return decoded
        }
    }

    /// The cases for `rule` in `module`. Records an issue when there are none, so a rule
    /// renamed in TypeScript can't leave a Swift test checking nothing.
    static func cases(_ module: String, _ rule: String, sourceLocation: SourceLocation = #_sourceLocation)
        -> [FixtureCase]
    {
        let found = load(module)[rule] ?? []
        if found.isEmpty {
            Issue.record("No fixture cases for \(module).\(rule)", sourceLocation: sourceLocation)
        }
        return found
    }

    /// Every rule name in a module's fixture file.
    static func rules(_ module: String) -> Set<String> { Set(load(module).keys) }
}

extension JSONValue {
    func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(self))
    }

    init<T: Encodable>(encoding value: T) throws {
        self = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
    }

    /// Whether `self` (Swift's result) matches `expected` (TypeScript's): a missing object key
    /// matches null, and numbers match within a relative `tolerance`.
    func matches(_ expected: JSONValue, tolerance: Double = 1e-9) -> Bool {
        switch (self, expected) {
        case (.number(let a), .number(let b)):
            return a == b || abs(a - b) <= tolerance * max(1, abs(a), abs(b))
        case (.array(let a), .array(let b)):
            return a.count == b.count && zip(a, b).allSatisfy { $0.matches($1, tolerance: tolerance) }
        case (.object(let a), .object(let b)):
            return Set(a.keys).union(b.keys).allSatisfy {
                (a[$0] ?? .null).matches(b[$0] ?? .null, tolerance: tolerance)
            }
        default:
            return self == expected
        }
    }
}

/// Checks every case of `rule`: `body` runs the Swift port on a case and returns its result.
/// A case TypeScript threw on must throw in Swift too.
func checkRule<T: Encodable>(
    _ module: String, _ rule: String, tolerance: Double = 1e-9,
    sourceLocation: SourceLocation = #_sourceLocation,
    _ body: (FixtureCase) throws -> T
) {
    for fixture in Fixtures.cases(module, rule, sourceLocation: sourceLocation) {
        do {
            let actual = try JSONValue(encoding: body(fixture))
            if let message = fixture.throws {
                Issue.record(
                    "\(rule) \(fixture): TypeScript threw \"\(message)\", Swift returned \(actual)",
                    sourceLocation: sourceLocation)
            } else if !actual.matches(fixture.result ?? .null, tolerance: tolerance) {
                Issue.record(
                    "\(rule) \(fixture): expected \(fixture.result ?? .null), got \(actual)",
                    sourceLocation: sourceLocation)
            }
        } catch {
            if fixture.throws == nil {
                Issue.record("\(rule) \(fixture): threw \(error)", sourceLocation: sourceLocation)
            }
        }
    }
}

/// A label table (`Record<K, string>` in TypeScript) as JSON, keyed by raw value.
func labelTable<K: RawRepresentable & CaseIterable>(_ label: (K) -> String) -> [String: String]
where K.RawValue == String {
    Dictionary(uniqueKeysWithValues: K.allCases.map { ($0.rawValue, label($0)) })
}

/// Thrown by a test body for an input Swift's types rule out (TypeScript threw on it).
struct NotRepresentable: Error {}
