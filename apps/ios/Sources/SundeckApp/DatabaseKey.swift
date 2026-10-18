#if canImport(Security)
    import Foundation
    import Security

    /// The local database key: 32 random bytes as hex, kept in the Keychain on this device only.
    /// Same account name as the Expo app (`leakbook.db-key.v1`), for the database move in S9.
    enum DatabaseKey {
        private static let account = "leakbook.db-key.v1"
        private static let service = "com.sundeckpro.app.database"

        static func loadOrCreate() throws -> String {
            if let existing = try read() { return existing }
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
                throw KeychainError(status: errSecAllocate)
            }
            let key = bytes.map { String(format: "%02x", $0) }.joined()
            let status = SecItemAdd(
                [
                    kSecClass: kSecClassGenericPassword,
                    kSecAttrService: service,
                    kSecAttrAccount: account,
                    kSecValueData: Data(key.utf8),
                    // Readable after the first unlock, so background uploads can open the database.
                    kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
                ] as CFDictionary, nil)
            guard status == errSecSuccess else { throw KeychainError(status: status) }
            return key
        }

        private static func read() throws -> String? {
            var item: CFTypeRef?
            let status = SecItemCopyMatching(
                [
                    kSecClass: kSecClassGenericPassword,
                    kSecAttrService: service,
                    kSecAttrAccount: account,
                    kSecReturnData: true,
                ] as CFDictionary, &item)
            if status == errSecItemNotFound { return nil }
            guard status == errSecSuccess, let data = item as? Data else { throw KeychainError(status: status) }
            return String(decoding: data, as: UTF8.self)
        }
    }

    struct KeychainError: Error, CustomStringConvertible {
        let status: OSStatus
        var description: String { "Keychain error \(status)" }
    }
#endif
