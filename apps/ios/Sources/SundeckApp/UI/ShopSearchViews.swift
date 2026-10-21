#if os(iOS)
    import SundeckCore
    import SwiftUI

    // One search across the shop (owner, 2026-10-20; docs/plans/search-and-activity.md section 1;
    // website components/shop-search.tsx PhoneSearch): the field under the Jobs title, where
    // iPhone apps put search; typing shows the grouped results over the list, Cancel returns to
    // it. The tab roots draw their large title in the bar's row (RootTitle.swift), so the field
    // is drawn in the page under it, as the system search bar looks, rather than in the bar's
    // drawer (which would push the bar's row down under the title).

    /// The iOS search field: filled, rounded, the magnifier inside, a clear button once typed in,
    /// and Cancel beside it while searching.
    struct ShopSearchField: View {
        @Binding var text: String
        var focused: FocusState<Bool>.Binding
        /// Searching: Cancel shows.
        var active: Bool
        var onCancel: () -> Void

        var body: some View {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.body)
                        .foregroundStyle(Color.textMuted)
                        .accessibilityHidden(true)
                    TextField(
                        SearchText.search, text: $text,
                        prompt: Text(SearchText.placeholder).foregroundStyle(Color.placeholder)
                    )
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .focused(focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityLabel(SearchText.search)
                    if !text.isEmpty {
                        Button {
                            text = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.textMuted)
                                .frame(width: minTarget, height: minTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear Text")
                    }
                }
                .padding(.leading, 10)
                .padding(.trailing, text.isEmpty ? 10 : 0)
                .frame(minHeight: minTarget)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.text.opacity(0.06)))
                if active {
                    Button(SearchText.cancel, action: onCancel)
                        .textRole(.body)
                        .foregroundStyle(Color.link)
                        .frame(minHeight: minTarget)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(Motion.snappy, value: active)
        }
    }

    /// What the field shows while searching: Recent before two characters, then the grouped
    /// results (or nothing found). `group` is See All for one group.
    struct ShopSearchResults: View {
        var query: String
        var results: SearchResults?
        var recent: [RecentItem]
        @Binding var group: SearchGroupKey?
        var onOpenHit: (SearchHit) -> Void
        var onOpenRecent: (RecentItem) -> Void
        var onClearRecent: () -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 24) {
                if !normalizeSearch(query).ready {
                    recentList
                } else if let results {
                    if results.empty {
                        let none = noResultsText(query)
                        VStack(spacing: 4) {
                            Text(none.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            Text(none.hint).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                        .accessibilityElement(children: .combine)
                    } else {
                        if group != nil {
                            Button {
                                group = nil
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "chevron.left").font(.body.weight(.semibold))
                                    Text(SearchText.allResults)
                                }
                                .textRole(.body)
                                .foregroundStyle(Color.link)
                                .frame(minHeight: minTarget)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .padding(.vertical, -8)
                        }
                        ForEach(results.groups) { g in groupList(g) }
                    }
                } else {
                    Text("Searching…").textRole(.body).foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }
            }
        }

        private func header<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
            HStack(alignment: .center) {
                SectionLabel(title)
                Spacer(minLength: 8)
                trailing()
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 20)
        }

        @ViewBuilder private var recentList: some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                header(SearchText.recent) {
                    if !recent.isEmpty {
                        Button(SearchText.clear, action: onClearRecent)
                            .textRole(.secondary)
                            .foregroundStyle(Color.link)
                            .frame(minHeight: minTarget)
                            .padding(.vertical, -12)
                    }
                }
                if recent.isEmpty {
                    Text(SearchText.noRecent).textRole(.secondary).foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                } else {
                    GroupedRows(recent) { r in
                        Button {
                            onOpenRecent(r)
                        } label: {
                            SearchRow(title: r.title, detail: r.detail, meta: nil, emphasized: false, opens: true)
                        }
                        .buttonStyle(.row)
                    }
                }
            }
        }

        private func groupList(_ g: SearchGroup) -> some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                header(g.title) {
                    if g.more && group == nil {
                        Button(SearchText.seeAll) { group = g.key }
                            .textRole(.secondary)
                            .foregroundStyle(Color.link)
                            .frame(minHeight: minTarget)
                            .padding(.vertical, -12)
                            .accessibilityLabel("\(SearchText.seeAll) \(g.title) (\(String(g.total)))")
                    }
                }
                GroupedRows(g.hits) { hit in
                    if hit.open != nil {
                        Button {
                            onOpenHit(hit)
                        } label: {
                            SearchRow(
                                title: hit.title, detail: hit.detail, meta: hit.meta, emphasized: true, opens: true)
                        }
                        .buttonStyle(.row)
                    } else {
                        SearchRow(title: hit.title, detail: hit.detail, meta: hit.meta, emphasized: true, opens: false)
                    }
                }
            }
        }
    }

    /// A result or Recent row: the title, a second line, the date or status at the right.
    private struct SearchRow: View {
        var title: String
        var detail: String?
        var meta: String?
        var emphasized: Bool
        var opens: Bool

        var body: some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).textRole(emphasized ? .bodyEmphasis : .body).foregroundStyle(Color.text)
                        .lineLimit(1)
                    if let detail {
                        Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let meta {
                    Text(meta).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                if opens { Chevron() }
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }
#endif
