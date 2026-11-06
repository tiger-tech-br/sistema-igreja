package br.com.assembleiadedeus.membro;

import android.os.Bundle;
import br.com.assembleiadedeus.shared.SecureSessionPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
