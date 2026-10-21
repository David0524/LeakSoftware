import Foundation
import SundeckCore
import Testing

/// download.ts: the first download's progress (owner, 2026-10-20).
@Suite struct DownloadTests {
    let module = "download"

    @Test func everyRuleIsChecked() {
        #expect(Fixtures.rules(module) == ["DOWNLOAD_KINDS", "downloadProgress", "downloadCount"])
    }

    @Test func progress() {
        checkRule(module, "DOWNLOAD_KINDS") { _ in downloadKinds }
        checkRule(module, "downloadProgress") { c in
            downloadProgress(try c.arg(0, as: [String: Int].self), try c.arg(1, as: [String: Int]?.self))
        }
        checkRule(module, "downloadCount") { c in downloadCount(done: try c.arg(0), total: try c.arg(1)) }
    }
}
