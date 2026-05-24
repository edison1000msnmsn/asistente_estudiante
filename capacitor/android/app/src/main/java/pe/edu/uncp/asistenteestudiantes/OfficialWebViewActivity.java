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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class OfficialWebViewActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private String dni;
    private String codigo;
    private String selectorCampo1;
    private String selectorCampo2;
    private String selectorButton;
    private String apiBase;
    private String studentId;
    private long fireAt;
    private boolean fired = false;
    private boolean automationStarted = false;
    private boolean creditReported = false;

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
        apiBase = value(uri, "apiBase", "");
        studentId = value(uri, "studentId", "");
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
                startAutomationLoop();
            }
        });

        webView.loadUrl(targetUrl);
    }

    private void startAutomationLoop() {
        if (automationStarted) return;
        automationStarted = true;
        Toast.makeText(this, "Preparando formulario oficial", Toast.LENGTH_SHORT).show();
        runAutomationTick();
    }

    private void runAutomationTick() {
        if (fired) return;
        boolean shouldClick = System.currentTimeMillis() >= fireAt;
        fillAndMaybeClick(shouldClick);
        if (!shouldClick) {
            handler.postDelayed(this::runAutomationTick, 250);
        }
    }

    private void fillAndMaybeClick(boolean shouldClick) {
        String script = "(function(){"
                + "function pick(sel,text){var nodes=[].slice.call(document.querySelectorAll(sel));"
                + "if(!text)return nodes[0];"
                + "return nodes.find(function(n){return (n.innerText||n.value||'').toUpperCase().indexOf(text)>=0;})||nodes[0];}"
                + "function pickInput(extra){return pick(extra+', #dni, input[name=\"tl_dni\"], input[id*=\"dni\"], input[placeholder*=\"DNI\"], input[placeholder*=\"Documento\"]');}"
                + "function pickCode(extra){return pick(extra+', #codigo, #matricula, input[name*=\"codigo\"], input[name*=\"matricula\"], input[id*=\"codigo\"], input[id*=\"matricula\"], input[placeholder*=\"Código\"], input[placeholder*=\"Codigo\"], input[placeholder*=\"Matrícula\"], input[placeholder*=\"Matricula\"]');}"
                + "function setVal(el,val){if(!el)return false;var p=Object.getPrototypeOf(el);var d=Object.getOwnPropertyDescriptor(p,'value');"
                + "if(d&&d.set){d.set.call(el,val);}else{el.value=val;}"
                + "el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:val}));"
                + "el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));return true;}"
                + "var a=pickInput(" + JSONObject.quote(selectorCampo1) + ");"
                + "var b=pickCode(" + JSONObject.quote(selectorCampo2) + ");"
                + "var ok1=setVal(a," + JSONObject.quote(dni) + ");"
                + "var ok2=setVal(b," + JSONObject.quote(codigo) + ");"
                + "var btn=pick(" + JSONObject.quote(selectorButton) + ",'GENERAR')||pick('.btn-register, button[type=\"submit\"], button.btn-success, button','GENERAR');"
                + "if(" + shouldClick + "&&ok1&&ok2&&btn){btn.removeAttribute('disabled');btn.disabled=false;setTimeout(function(){btn.click();},120);}"
                + "return JSON.stringify({dni:ok1,codigo:ok2,button:!!btn,clicked:" + shouldClick + "});"
                + "})();";
        webView.evaluateJavascript(script, value -> {
            if (shouldClick && !fired) {
                fired = true;
                Toast.makeText(this, "Datos pegados y click ejecutado", Toast.LENGTH_SHORT).show();
                handler.postDelayed(this::captureTicket, 5000);
                handler.postDelayed(this::detectTicketResult, 5500);
                handler.postDelayed(this::captureTicket, 9000);
                handler.postDelayed(this::detectTicketResult, 9500);
            }
        });
    }

    private void detectTicketResult() {
        if (webView == null || creditReported) return;
        String script = "(function(){return (document.body && document.body.innerText || '').toUpperCase();})();";
        webView.evaluateJavascript(script, value -> {
            String text = value == null ? "" : value.toUpperCase();
            boolean success = text.contains("TICKET VIRTUAL")
                    || text.contains("TICKET GENERADO")
                    || text.contains("GENERADO EXITOSAMENTE")
                    || text.contains("IMPRIMIR TICKET");
            boolean closed = text.contains("CUPOS AGOTADOS")
                    || (text.contains("REGISTRO") && text.contains("CERR"))
                    || text.contains("NO HAY CUPO");
            if (success) {
                creditReported = true;
                reportCreditUse();
            } else if (closed) {
                Toast.makeText(this, "La pagina oficial no genero ticket: sin cupos o registro cerrado", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void reportCreditUse() {
        if (apiBase.isEmpty() || studentId.isEmpty()) {
            Toast.makeText(this, "Ticket detectado; no se pudo reportar cupo al backend", Toast.LENGTH_LONG).show();
            return;
        }
        new Thread(() -> {
            try {
                String normalizedBase = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
                URL url = new URL(normalizedBase + "/api/student/" + java.net.URLEncoder.encode(studentId, "UTF-8") + "/use-credit");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                OutputStream out = connection.getOutputStream();
                out.write("{}".getBytes("UTF-8"));
                out.flush();
                out.close();
                int code = connection.getResponseCode();
                handler.post(() -> Toast.makeText(this, code >= 200 && code < 300 ? "Ticket confirmado en backend" : "Ticket detectado; backend no desconto cupo", Toast.LENGTH_LONG).show());
                connection.disconnect();
            } catch (Exception error) {
                handler.post(() -> Toast.makeText(this, "Ticket detectado; no se pudo conectar al backend", Toast.LENGTH_LONG).show());
            }
        }).start();
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
