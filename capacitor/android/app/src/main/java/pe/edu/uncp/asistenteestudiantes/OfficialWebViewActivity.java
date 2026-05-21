package pe.edu.uncp.asistenteestudiantes;

import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;

public class OfficialWebViewActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private String dni;
    private String codigo;
    private String selectorCampo1;
    private String selectorCampo2;
    private String selectorButton;
    private long fireAt;
    private boolean fired = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri uri = getIntent().getData();
        if (uri == null) {
            finish();
            return;
        }

        String targetUrl = value(uri, "url", "https://comedor.uncp.edu.pe/charola");
        dni = value(uri, "dni", "");
        codigo = value(uri, "codigo", "");
        selectorCampo1 = value(uri, "s1", "input[name=\"dni\"], input[placeholder*=\"DNI\"], input[placeholder*=\"Documento\"]");
        selectorCampo2 = value(uri, "s2", "input[name=\"codigo\"], input[name=\"matricula\"], input[placeholder*=\"Codigo\"], input[placeholder*=\"Código\"], input[placeholder*=\"Matricula\"], input[placeholder*=\"Matrícula\"]");
        selectorButton = value(uri, "button", "button[type=\"submit\"], button, input[type=\"submit\"]");
        fireAt = parseLong(value(uri, "fireAt", "0"), System.currentTimeMillis());

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                scheduleFire();
            }
        });

        webView.loadUrl(targetUrl);
    }

    private void scheduleFire() {
        if (fired) return;
        long waitMs = Math.max(0, fireAt - System.currentTimeMillis());
        handler.postDelayed(this::fillAndClick, waitMs);
    }

    private void fillAndClick() {
        if (fired) return;
        fired = true;
        String script = "(function(){"
                + "function pick(sel,text){var nodes=[].slice.call(document.querySelectorAll(sel));"
                + "if(!text)return nodes[0];"
                + "return nodes.find(function(n){return (n.innerText||n.value||'').toUpperCase().indexOf(text)>=0;})||nodes[0];}"
                + "function setVal(el,val){if(!el)return false;var p=Object.getPrototypeOf(el);var d=Object.getOwnPropertyDescriptor(p,'value');"
                + "if(d&&d.set){d.set.call(el,val);}else{el.value=val;}"
                + "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}"
                + "var a=pick(" + JSONObject.quote(selectorCampo1) + ");"
                + "var b=pick(" + JSONObject.quote(selectorCampo2) + ");"
                + "setVal(a," + JSONObject.quote(dni) + ");"
                + "setVal(b," + JSONObject.quote(codigo) + ");"
                + "setTimeout(function(){var btn=pick(" + JSONObject.quote(selectorButton) + ",'GENERAR');if(btn){btn.click();}},80);"
                + "return true;"
                + "})();";
        webView.evaluateJavascript(script, null);
        Toast.makeText(this, "Datos enviados al formulario oficial", Toast.LENGTH_SHORT).show();
        handler.postDelayed(this::captureTicket, 5000);
        handler.postDelayed(this::captureTicket, 9000);
    }

    private void captureTicket() {
        try {
            Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
            webView.draw(canvas);
            File dir = new File(getFilesDir(), "tickets");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, "ticket-" + System.currentTimeMillis() + ".png");
            FileOutputStream out = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            out.flush();
            out.close();
            Toast.makeText(this, "Captura guardada en la app", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "No se pudo guardar la captura", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private String value(Uri uri, String key, String fallback) {
        String value = uri.getQueryParameter(key);
        return value == null ? fallback : value;
    }

    private long parseLong(String value, long fallback) {
        try {
            return Long.parseLong(value);
        } catch (Exception error) {
            return fallback;
        }
    }
}
