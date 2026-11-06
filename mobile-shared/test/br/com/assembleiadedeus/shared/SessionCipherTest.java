package br.com.assembleiadedeus.shared;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** Standalone JVM checks for the production cipher, without Android or another library. */
public final class SessionCipherTest {
    private static byte[] context(String packageName) {
        return (packageName + ":remembered-session:v1").getBytes(StandardCharsets.UTF_8);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface Operation { void run() throws Exception; }

    private static void rejects(Operation operation, String message) throws Exception {
        try {
            operation.run();
        } catch (GeneralSecurityException | IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        byte[] readerContext = context("br.com.assembleiadedeus.leitor");
        byte[] memberContext = context("br.com.assembleiadedeus.membro");
        String value = "{\"version\":1,\"refreshToken\":\"opaque-fixture-only\",\"note\":\"Sessão de teste\"}";

        SessionCipher.EncryptedData first = SessionCipher.encrypt(key, value, readerContext);
        SessionCipher.EncryptedData second = SessionCipher.encrypt(key, value, readerContext);
        check(SessionCipher.decrypt(key, first, readerContext).equals(value), "UTF-8 roundtrip must preserve the record");
        check(!Arrays.equals(first.getCiphertext(), value.getBytes(StandardCharsets.UTF_8)), "The stored record must be encrypted");
        check(!Arrays.equals(first.getIv(), second.getIv()), "Each write must generate a new IV");
        check(!Arrays.equals(first.getCiphertext(), second.getCiphertext()), "Repeated records must have different ciphertexts");

        byte[] tamperedCiphertext = first.getCiphertext();
        tamperedCiphertext[tamperedCiphertext.length / 2] ^= 1;
        SessionCipher.EncryptedData tampered = new SessionCipher.EncryptedData(first.getIv(), tamperedCiphertext);
        rejects(() -> SessionCipher.decrypt(key, tampered, readerContext), "Ciphertext alteration must be rejected");

        byte[] tamperedIv = first.getIv();
        tamperedIv[0] ^= 1;
        SessionCipher.EncryptedData changedIv = new SessionCipher.EncryptedData(tamperedIv, first.getCiphertext());
        rejects(() -> SessionCipher.decrypt(key, changedIv, readerContext), "IV alteration must be rejected");
        rejects(() -> SessionCipher.decrypt(key, first, memberContext), "The other app context must not decrypt the record");
        SecretKey otherKey = generator.generateKey();
        rejects(() -> SessionCipher.decrypt(otherKey, first, readerContext), "Another key must not decrypt the record");

        rejects(() -> new SessionCipher.EncryptedData(new byte[11], first.getCiphertext()), "A malformed IV must be rejected");
        rejects(() -> new SessionCipher.EncryptedData(first.getIv(), new byte[15]), "A truncated tag must be rejected");
        rejects(() -> SessionCipher.encrypt(key, "x".repeat(8193), readerContext), "Oversized input must be rejected");
        rejects(() -> SessionCipher.encrypt(key, "", readerContext), "Empty input must be rejected");
        String maximum = "ç".repeat(8192);
        SessionCipher.EncryptedData maxEncrypted = SessionCipher.encrypt(key, maximum, readerContext);
        check(SessionCipher.decrypt(key, maxEncrypted, readerContext).equals(maximum), "The largest valid UTF-8 record must roundtrip");

        byte[] externalIv = first.getIv();
        externalIv[0] ^= 1;
        check(SessionCipher.decrypt(key, first, readerContext).equals(value), "The encrypted record must not expose mutable IV storage");
        System.out.println("SessionCipher: authenticated roundtrip, fresh IV, tampering, app isolation, key isolation and bounds passed.");
    }
}
