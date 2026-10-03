import SwiftUI
import SymptoPageCore

@main
struct SymptoPageApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Theme.accent)
                .task { if let s = model.state { await model.notifications.replan(s, translator: model.translator) } }
                .onChange(of: phase) { _, p in
                    if p == .active, let s = model.state { Task { await model.notifications.replan(s, translator: model.translator) } }
                }
        }
    }
}

/// Design tokens shared with ui/styles/tokens.css (colleague's mock-ups).
enum Theme {
    static let accent = Color(red: 0x16 / 255, green: 0x73 / 255, blue: 0x74 / 255)   // #167374
    static let accentSoft = Color(red: 0x8E / 255, green: 0xD6 / 255, blue: 0xCF / 255) // #8ED6CF
    static let chip = Color(red: 0xCD / 255, green: 0xED / 255, blue: 0xE9 / 255)       // #CDEDE9
    static let background = Color(red: 0xEA / 255, green: 0xF7 / 255, blue: 0xF5 / 255) // #EAF7F5
    static let ink = Color(red: 0x0F / 255, green: 0x2A / 255, blue: 0x2E / 255)        // #0F2A2E
    static let coral = Color(red: 0xFF / 255, green: 0x9B / 255, blue: 0x82 / 255)      // #FF9B82, dark text
}
