#if os(iOS)
    import Charts
    import SundeckCore
    import SwiftUI

    /// Trends on a pool's chemical log (owner, 2026-11-16; docs/design/2026-11-16-chemistry-trends.md,
    /// website components/chem-trends.tsx, Expo features/chemicals/Trends.tsx; the series are
    /// SundeckCore/ChemistryTrends.swift): 90 Days | 6 Months | 1 Year, a small line chart per
    /// reading with the pool's range shaded, and each month's chemical cost as bars when the shop
    /// charges for chemicals. Each chart reads as one sentence to VoiceOver.
    struct ChemicalTrends: View {
        var readings: [ChemicalReading]
        var additions: [ChemicalAddition]
        var charges: Bool
        var timeZone: String
        @State private var period: TrendPeriod = .days90

        var body: some View {
            let now = isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)
            let series = readingSeries(readings, period: period, now: now)
            let bars = chemicalCostBars(additions, period: period, now: now, timeZone: timeZone)
            let window = trendWindow(period, now: now)
            let from = parseISODate(window.from) ?? Date()
            let to = parseISODate(window.to) ?? Date()
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Trends")
                Segmented(
                    selection: $period, options: trendPeriods.map(\.key),
                    label: { key in trendPeriods.first { $0.key == key }?.label ?? "" }, title: "Period",
                    fillsWidth: true)
                if series.isEmpty {
                    Text(OutOfRangeText.noReadings)
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .frame(maxWidth: .infinity)
                        .padding(24)
                        .background(Color.fill.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                ForEach(series) { s in lineCard(s, from: from, to: to) }
                if charges, bars.contains(where: { $0.cents > 0 }) { costCard(bars) }
            }
        }

        private func lineCard(_ s: ReadingSeries, from: Date, to: Date) -> some View {
            let tone = s.status == "ok" ? Color.textMuted : Color.fail
            let word = s.status == "ok" ? "In range" : s.status == "low" ? "Low" : "High"
            return VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(s.label).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text("\(levelText(s.latest)) · \(word)")
                        .textRole(.body).monospacedDigit().foregroundStyle(tone)
                }
                Chart {
                    RectangleMark(
                        xStart: .value("From", from), xEnd: .value("To", to), yStart: .value("Low", s.low),
                        yEnd: .value("High", s.high)
                    )
                    .foregroundStyle(Color.pass.opacity(0.2))
                    ForEach(s.points, id: \.at) { p in
                        if let at = parseISODate(p.at) {
                            LineMark(x: .value("Date", at), y: .value(s.label, p.value))
                                .foregroundStyle(Color.chart)
                            PointMark(x: .value("Date", at), y: .value(s.label, p.value))
                                .foregroundStyle(p.value < s.low || p.value > s.high ? Color.fail : Color.chart)
                        }
                    }
                }
                .chartXScale(domain: from...to)
                .chartYScale(domain: s.min...s.max)
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 3)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                    }
                }
                .frame(height: 120)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(s.summary)
                Text(
                    "Aim for \(levelText(s.low))–\(levelText(s.high)) · \(s.points.count) \(s.points.count == 1 ? "reading" : "readings")"
                )
                .textRole(.footnote)
                .foregroundStyle(Color.textMuted)
            }
            .card()
        }

        private func costCard(_ bars: [CostBar]) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Chemical Cost").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text(formatCents(bars.reduce(0) { $0 + $1.cents }))
                        .textRole(.body).monospacedDigit().foregroundStyle(Color.textMuted)
                }
                Chart(bars) { b in
                    BarMark(x: .value("Month", b.month), y: .value("Cost", Double(b.cents) / 100))
                        .foregroundStyle(Color.chart)
                        .cornerRadius(4)
                }
                .chartXAxis {
                    AxisMarks { value in
                        AxisValueLabel {
                            if let m = value.as(String.self), let bar = bars.first(where: { $0.month == m }) {
                                Text(bar.label)
                            }
                        }
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) { Text("$\(Int(v))") }
                        }
                    }
                }
                .frame(height: 140)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(costSummary(bars))
                Text(OutOfRangeText.costNote).textRole(.footnote).foregroundStyle(Color.textMuted)
            }
            .card()
        }
    }

    /// Out of Range (owner, 2026-11-16): the last 30 days' readings far outside the pool's range,
    /// newest first. A row opens the pool's Chemical screen.
    struct OutOfRangeList: View {
        var entries: [OutOfRangeEntry]
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            if entries.isEmpty {
                Text(OutOfRangeText.empty)
                    .textRole(.body)
                    .foregroundStyle(Color.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(24)
                    .background(Color.fill.opacity(0.5), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                Grouped(label: OutOfRangeText.title, footer: OutOfRangeText.footer) {
                    ForEach(entries) { e in
                        Button {
                            openRoute(.more(.chemicals(ChemicalTarget(propertyId: e.propertyId))))
                        } label: {
                            // The pool, then the reading in red, then the range, date and tech (as
                            // on the website): a value on the right squeezes the pool's name.
                            HStack(spacing: CGFloat(Spacing.rowItems)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(e.pool).textRole(.body).foregroundStyle(Color.text)
                                    Text(e.value).textRole(.body).monospacedDigit().foregroundStyle(Color.fail)
                                    Text(e.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                                }
                                Spacer(minLength: 0)
                                Chevron()
                            }
                            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                            .padding(.vertical, CGFloat(Spacing.rowVertical))
                            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.row)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(e.pool), \(e.value), \(e.detail)")
                    }
                }
            }
        }
    }
#endif
