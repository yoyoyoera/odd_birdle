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

    /// ProMotion: WebKit paints a page at most about 60 times a second by default (the feature "Prefer Page Rendering Updates
    /// near 60fps", which Safari's own settings can switch off). Turn that feature off for this web view so requestAnimationFrame
    /// follows the display (120 Hz on ProMotion iPhones). It uses WebKit's private feature list, looked up by name at run time:
    /// if a later iOS drops it, nothing happens and the game simply stays at 60.
    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        Self.allowFullFrameRate(configuration.preferences)
        // The page is a game: holding a finger on a word (the YOU flag, the scores) must never bring up the text-selection
        // loupe, Look Up or Live Text. This is the WebView's own switch; the page's user-select: none is not enough.
        configuration.preferences.isTextInteractionEnabled = false
        configuration.dataDetectorTypes = []
        return configuration
    }

    private static func allowFullFrameRate(_ preferences: WKPreferences) {
        let listSelector = NSSelectorFromString("_features")
        let setSelector = NSSelectorFromString("_setEnabled:forFeature:")
        guard (WKPreferences.self as AnyObject).responds(to: listSelector), preferences.responds(to: setSelector),
              let list = (WKPreferences.self as AnyObject).perform(listSelector)?.takeUnretainedValue() as? [NSObject],
              let feature = list.first(where: { ($0.value(forKey: "key") as? String) == "PreferPageRenderingUpdatesNear60FPSEnabled" })
        else {
            print("Odd Birdle: the 60 fps page-rendering feature was not found; staying at 60 fps.")
            return
        }
        typealias SetFeature = @convention(c) (AnyObject, Selector, Bool, AnyObject) -> Void
        let function = unsafeBitCast(preferences.method(for: setSelector), to: SetFeature.self)
        function(preferences, setSelector, false, feature)
        print("Odd Birdle: page rendering is allowed above 60 fps.")
    }

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

        // No pinch zoom, and no magnifier or lookup from a long press: the page is a game.
        if let scrollView = webView?.scrollView {
            scrollView.pinchGestureRecognizer?.isEnabled = false
            scrollView.minimumZoomScale = 1
            scrollView.maximumZoomScale = 1
            scrollView.bouncesZoom = false
        }
        webView?.allowsLinkPreview = false

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
