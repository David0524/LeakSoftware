#if os(iOS)
    import SwiftUI

    // Usage for the Admin portal (owner, 2026-10-22): each screen named by the website's path for
    // it, so the portal shows the same names for the iPhone, Android and the website.

    extension View {
        /// Counts time on this screen while it's showing ("/jobs/:id").
        func usageScreen(_ path: String) -> some View {
            onAppear { UsageRecorder.shared.screenChanged(path) }
        }
    }

    /// "settingsPage(...)" or "myPhone" as "settings-page", "my-phone".
    func usageCaseName(_ value: Any) -> String {
        let name = String(String(describing: value).prefix { $0 != "(" && $0 != "." })
        return name.reduce(into: "") { out, c in
            if c.isUppercase { out += "-" + c.lowercased() } else { out.append(c) }
        }
    }

    extension Route {
        var usagePath: String {
            switch self {
            case .job: "/jobs/:id"
            case .jobSection(_, let section): "/jobs/:id/\(section == .wrapUp ? "wrap-up" : section.rawValue)"
            case .sync: "/sync"
            case .messages(let route): route.usagePath
            case .more(let route): route.usagePath
            case .component: "/jobs/:id/checklist/item"
            case .signature: "/jobs/:id/signature"
            case .review: "/jobs/:id/review"
            case .newJob: "/jobs/new"
            }
        }
    }

    extension MessagesRoute {
        var usagePath: String {
            switch self {
            case .conversation: "/messages/conversation"
            case .newMessage: "/messages/new"
            case .customer: "/customers/:id"
            }
        }
    }

    extension MoreRoute {
        var usagePath: String {
            switch self {
            case .customers: "/customers"
            case .customer: "/customers/:id"
            case .invoices, .invoicesFiltered: "/invoices"
            case .chemicals: "/chemicals"
            case .settings: "/settings"
            case .settingsPage(let page): "/settings/\(usageCaseName(page))"
            case .sync: "/sync"
            case .dashboard: "/dashboard"
            case .activity: "/activity"
            case .jobs: "/jobs"
            case .myPhone: "/more/my-phone"
            case .myProfile: "/more/my-profile"
            case .notifications: "/more/notifications"
            }
        }
    }
#endif
