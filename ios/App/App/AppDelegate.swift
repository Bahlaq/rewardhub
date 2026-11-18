import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Required so Messaging can turn the APNs device token into an FCM
        // registration token that Firestore / Firebase Console understand.
        FirebaseApp.configure()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // CRITICAL for Capacitor Push + Firebase:
    // Without these two methods, PushNotifications.register() never emits
    // the JS "registration" event on iOS, so tokens never reach Firestore.
    // We convert APNs → FCM here so the token saved is an FCM token (usable
    // by Firebase Admin / Console), not a raw APNs hex string.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(
                    name: .capacitorDidFailToRegisterForRemoteNotifications,
                    object: error
                )
                return
            }
            guard let token = token else {
                NotificationCenter.default.post(
                    name: .capacitorDidFailToRegisterForRemoteNotifications,
                    object: NSError(
                        domain: "RewardHubPush",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "FCM token was nil"]
                    )
                )
                return
            }
            NotificationCenter.default.post(
                name: .capacitorDidRegisterForRemoteNotifications,
                object: token
            )
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

}
