import UIKit
import Capacitor

/// Root view controller of Odd Birdle: the Capacitor bridge plus the settings a
/// landscape-only, whole-screen touch game needs.
///
/// - Status bar hidden; home indicator auto-hidden via the SystemBars plugin config.
/// - Top and bottom screen-edge system gestures are deferred: the whole landscape
///   screen is the racket pad, so the first swipe from the bottom edge goes to the
///   game and only a second swipe goes Home (same for Notification/Control Center).
/// - Landscape left/right only.
/// - The screen stays on while the app is active.
class MainViewController: CAPBridgeViewController {
    private var lifecycleObservers: [NSObjectProtocol] = []

    override var prefersStatusBarHidden: Bool { true }

    // The home indicator is hidden by Capacitor's SystemBars plugin ("hidden": true in capacitor.config.json):
    // Capacitor declares prefersHomeIndicatorAutoHidden itself and it cannot be overridden here.

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.bottom, .top] }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Page colour of the game (#182223), so no white shows around the WebView.
        view.backgroundColor = UIColor(red: 0x18 / 255.0, green: 0x22 / 255.0, blue: 0x23 / 255.0, alpha: 1)

        let center = NotificationCenter.default
        lifecycleObservers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            UIApplication.shared.isIdleTimerDisabled = true
            self?.refreshSystemChrome()
        })
        lifecycleObservers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in
            UIApplication.shared.isIdleTimerDisabled = false
        })

        refreshSystemChrome()
        #if DEBUG
        runCIScriptWhenLoaded()
        #endif
    }

    #if DEBUG
    private var ciLoadObservation: NSKeyValueObservation?

    /// CI only (Debug builds): `SIMCTL_CHILD_ODDBIRDLE_CI_EVAL='<js>' xcrun simctl launch ...`
    /// runs that JavaScript once the first page has loaded, e.g. to press CPU for a
    /// match screenshot in .github/workflows/ios.yml. Release builds do not contain this.
    private func runCIScriptWhenLoaded() {
        guard let script = ProcessInfo.processInfo.environment["ODDBIRDLE_CI_EVAL"], !script.isEmpty,
              let webView = webView else { return }
        ciLoadObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
            guard !view.isLoading, view.url != nil else { return }
            self?.ciLoadObservation = nil
            view.evaluateJavaScript(script) { _, error in
                if let error = error { print("ODDBIRDLE_CI_EVAL failed: \(error)") }
            }
        }
    }
    #endif

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true
        refreshSystemChrome()
    }

    deinit {
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func refreshSystemChrome() {
        setNeedsStatusBarAppearanceUpdate()
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }
}
