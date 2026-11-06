package br.com.assembleiadedeus.shared;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Authenticated encryption used by the two apps; it never stores or exports a key. */
public final class SessionCipher {
    public static final int MAX_VALUE_CHARACTERS = 8192;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int MAX_CIPHERTEXT_BYTES = MAX_VALUE_CHARACTERS * 4 + TAG_BITS / 8;

    private SessionCipher() {}

    public static final class EncryptedData {
        private final byte[] iv;
        private final byte[] ciphertext;

        public EncryptedData(byte[] iv, byte[] ciphertext) {
            if (iv == null || iv.length != IV_BYTES || ciphertext == null ||
                ciphertext.length < TAG_BITS / 8 || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
                throw new IllegalArgumentException("Registro de acesso inválido.");
            }
            this.iv = iv.clone();
            this.ciphertext = ciphertext.clone();
        }

        public byte[] getIv() { return iv.clone(); }
        public byte[] getCiphertext() { return ciphertext.clone(); }
    }

    public static EncryptedData encrypt(SecretKey key, String value, byte[] context) throws GeneralSecurityException {
        if (value == null || value.isEmpty() || value.length() > MAX_VALUE_CHARACTERS) {
            throw new IllegalArgumentException("Registro de acesso inválido.");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // Let the provider generate a fresh IV for every write, including Android Keystore keys.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(context);
        return new EncryptedData(cipher.getIV(), cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    public static String decrypt(SecretKey key, EncryptedData encrypted, byte[] context) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, encrypted.getIv()));
        cipher.updateAAD(context);
        String value = new String(cipher.doFinal(encrypted.getCiphertext()), StandardCharsets.UTF_8);
        if (value.isEmpty() || value.length() > MAX_VALUE_CHARACTERS) {
            throw new IllegalArgumentException("Registro de acesso inválido.");
        }
        return value;
    }
}
