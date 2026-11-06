package br.com.assembleiadedeus.shared;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.json.JSONObject;

/** One encrypted remembered-session record, isolated by the Android application UID. */
@CapacitorPlugin(name = "SecureSession")
public final class SecureSessionPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String PREFERENCES = "remembered_session_v1";
    private static final String RECORD = "record";
    private static final int MAX_STORED_CHARACTERS = 45000;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private String keyAlias() {
        return getContext().getPackageName() + ".remembered-session.v1";
    }

    private byte[] encryptionContext() {
        return (getContext().getPackageName() + ":remembered-session:v1").getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey readKey() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        KeyStore.Entry entry = store.getEntry(keyAlias(), null);
        return entry instanceof KeyStore.SecretKeyEntry ? ((KeyStore.SecretKeyEntry) entry).getSecretKey() : null;
    }

    private SecretKey getOrCreateKey() throws Exception {
        SecretKey existing = readKey();
        if (existing != null) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(keyAlias(), KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .setUserAuthenticationRequired(false)
            .build());
        return generator.generateKey();
    }

    private void discardUnreadableKey() {
        try {
            KeyStore store = KeyStore.getInstance(KEYSTORE);
            store.load(null);
            store.deleteEntry(keyAlias());
        } catch (Exception ignored) {
            // Failure never triggers a plaintext fallback; a later save will reject if the key is unusable.
        }
    }

    private void resolveEmpty(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", JSONObject.NULL);
        call.resolve(result);
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        SharedPreferences storage = preferences();
        try {
            String stored = storage.getString(RECORD, null);
            if (stored == null) {
                resolveEmpty(call);
                return;
            }
            if (stored.length() > MAX_STORED_CHARACTERS) throw new IllegalArgumentException("Registro inválido.");
            JSONObject record = new JSONObject(stored);
            if (record.getInt("version") != 1) throw new IllegalArgumentException("Registro inválido.");
            SecretKey key = readKey();
            if (key == null) throw new IllegalStateException("A chave do aparelho não está disponível.");
            SessionCipher.EncryptedData encrypted = new SessionCipher.EncryptedData(
                Base64.decode(record.getString("iv"), Base64.NO_WRAP),
                Base64.decode(record.getString("ciphertext"), Base64.NO_WRAP));
            String value = SessionCipher.decrypt(key, encrypted, encryptionContext());
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception ignored) {
            // Missing keys, restored data or tampering must require a new login, never a plaintext fallback.
            if (!storage.edit().remove(RECORD).commit()) {
                call.reject("Não foi possível limpar o acesso salvo neste aparelho.", "SESSION_STORAGE_REMOVE_FAILED");
                return;
            }
            discardUnreadableKey();
            resolveEmpty(call);
        }
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty() || value.length() > SessionCipher.MAX_VALUE_CHARACTERS) {
            call.reject("Registro de acesso inválido.", "SESSION_STORAGE_INVALID_VALUE");
            return;
        }
        try {
            SessionCipher.EncryptedData encrypted = SessionCipher.encrypt(getOrCreateKey(), value, encryptionContext());
            JSONObject record = new JSONObject();
            record.put("version", 1);
            record.put("iv", Base64.encodeToString(encrypted.getIv(), Base64.NO_WRAP));
            record.put("ciphertext", Base64.encodeToString(encrypted.getCiphertext(), Base64.NO_WRAP));
            if (!preferences().edit().putString(RECORD, record.toString()).commit()) {
                call.reject("Não foi possível manter este acesso salvo no aparelho.", "SESSION_STORAGE_WRITE_FAILED");
                return;
            }
            call.resolve();
        } catch (Exception ignored) {
            // Do not expose cryptographic details or any session value through logs or bridge errors.
            call.reject("Não foi possível proteger o acesso neste aparelho. Entre sem manter conectado.", "SESSION_STORAGE_UNAVAILABLE");
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        if (!preferences().edit().remove(RECORD).commit()) {
            call.reject("Não foi possível limpar o acesso salvo neste aparelho.", "SESSION_STORAGE_REMOVE_FAILED");
            return;
        }
        call.resolve();
    }
}
