package pe.edu.uncp.asistenteestudiantes;

import android.app.Activity;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class OfficialWebViewActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat clock = new SimpleDateFormat("HH:mm:ss", Locale.US);

    private WebView webView;
    private TextView statusText;
    private TextView logText;
    private ScrollView logScroll;

    private String dni;
    private String codigo;
    private String selectorCampo1;
    private String selectorCampo2;
    private String selectorButton;
    private String apiBase;
    private String studentId;
    private long fireAt;
    private long deadlineAt;
    private int maxAttempts;
    private int intervalMs;
    private int clickAttempts = 0;
    private int reloadAttempts = 0;
    private long lastPrepareLogAt = 0;
    private long lastReloadAt = 0;
    private boolean stopped = false;
    private boolean successDetected = false;
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
        selectorCampo1 = value(uri, "s1", "#dni, input[name=\"tl_dni\"], input[id*=\"dni\"], input[placeholder*=\"DNI\"]");
        selectorCampo2 = value(uri, "s2", "#codigo, #matricula, input[name*=\"codigo\"], input[name*=\"matricula\"], input[id*=\"codigo\"], input[id*=\"matricula\"]");
        selectorButton = value(uri, "button", ".btn-register, button[type=\"submit\"], button.btn-success, button");
        apiBase = value(uri, "apiBase", "");
        studentId = value(uri, "studentId", "");
        fireAt = parseLong(value(uri, "fireAt", "0"), System.currentTimeMillis());
        maxAttempts = Math.max(1, (int) parseLong(value(uri, "maxAttempts", "10"), 10));
        intervalMs = Math.max(80, (int) parseLong(value(uri, "intervalMs", "120"), 120));
        long timeoutMs = Math.max(15000, parseLong(value(uri, "timeoutMs", "20000"), 20000));
        deadlineAt = Math.max(System.currentTimeMillis() + timeoutMs, fireAt + timeoutMs);

        buildLayout();
        configureWebView();

        log("[App iniciada]");
        log("Inicializando sesion...");
        log("DNI y codigo recibidos.");
        if (fireAt > System.currentTimeMillis() + 500) {
            log("Preparando disparos para " + clock.format(new Date(fireAt)) + ".");
            setStatus("PREPARANDO FORMULARIO");
        } else {
            log("Verificacion inmediata.");
            setStatus("FORMULARIO EN PROCESO");
        }

        webView.loadUrl(targetUrl);
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(39, 43, 46));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(18), dp(10), dp(18), dp(8));
        header.setBackgroundColor(Color.rgb(222, 248, 246));
        TextView title = new TextView(this);
        title.setText("COMEDOR UNCP");
        title.setTextColor(Color.rgb(33, 129, 132));
        title.setTextSize(20);
        title.setGravity(Gravity.START);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        TextView subtitle = new TextView(this);
        subtitle.setText("Registro automatico de tickets");
        subtitle.setTextColor(Color.rgb(112, 130, 140));
        subtitle.setTextSize(12);
        header.addView(title);
        header.addView(subtitle);
        root.addView(header);

        LinearLayout tabs = new LinearLayout(this);
        tabs.setOrientation(LinearLayout.HORIZONTAL);
        tabs.setBackgroundColor(Color.rgb(72, 72, 72));
        TextView registro = tabText("Registro");
        TextView vivo = tabText("Web en vivo");
        tabs.addView(registro, new LinearLayout.LayoutParams(0, dp(42), 1));
        tabs.addView(vivo, new LinearLayout.LayoutParams(0, dp(42), 1));
        root.addView(tabs);

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 2.35f));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(16), dp(12), dp(16), dp(12));
        controls.setBackgroundColor(Color.rgb(39, 43, 46));

        LinearLayout statusRow = new LinearLayout(this);
        statusRow.setOrientation(LinearLayout.HORIZONTAL);
        statusRow.setGravity(Gravity.CENTER_VERTICAL);
        statusRow.setPadding(dp(12), 0, dp(12), 0);
        statusRow.setBackgroundColor(Color.rgb(237, 252, 250));
        TextView statusLabel = new TextView(this);
        statusLabel.setText("Estado");
        statusLabel.setTextColor(Color.rgb(104, 116, 124));
        statusLabel.setTextSize(12);
        statusText = new TextView(this);
        statusText.setText("INICIANDO");
        statusText.setTextColor(Color.rgb(43, 172, 144));
        statusText.setTextSize(14);
        statusText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        statusRow.addView(statusLabel, new LinearLayout.LayoutParams(0, dp(44), .35f));
        statusRow.addView(statusText, new LinearLayout.LayoutParams(0, dp(44), 1f));
        controls.addView(statusRow);

        Button stopButton = new Button(this);
        stopButton.setText("DETENER");
        stopButton.setTextColor(Color.rgb(210, 61, 70));
        stopButton.setBackgroundColor(Color.TRANSPARENT);
        stopButton.setOnClickListener(v -> {
            stopped = true;
            setStatus("DETENIDO");
            log("Proceso detenido por el usuario.");
        });
        controls.addView(stopButton, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

        TextView logTitle = new TextView(this);
        logTitle.setText("Registro de actividad");
        logTitle.setTextColor(Color.rgb(156, 173, 180));
        logTitle.setTextSize(12);
        controls.addView(logTitle);

        logText = new TextView(this);
        logText.setTextColor(Color.rgb(165, 230, 209));
        logText.setTextSize(12);
        logText.setPadding(dp(12), dp(10), dp(12), dp(10));
        logText.setTypeface(android.graphics.Typeface.MONOSPACE);
        logText.setBackgroundColor(Color.rgb(21, 31, 43));
        logScroll = new ScrollView(this);
        logScroll.addView(logText);
        controls.addView(logScroll, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        root.addView(controls, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.15f));
        setContentView(root);
    }

    private TextView tabText(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setTextSize(15);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                log("Pagina oficial cargada.");
                runAutomationTick();
            }
        });
    }

    private void runAutomationTick() {
        if (stopped || successDetected) return;
        long now = System.currentTimeMillis();
        if (now > deadlineAt) {
            setStatus("SIN CONFIRMACION");
            log("Tiempo agotado: no se confirmo ticket ni mensaje de cierre.");
            captureTicket();
            return;
        }
        boolean shouldClick = now >= fireAt && clickAttempts < maxAttempts;
        fillAndMaybeClick(shouldClick);
    }

    private void fillAndMaybeClick(boolean shouldClick) {
        String script = "(function(){"
                + "function visible(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}"
                + "function q(sel){try{return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(visible);}catch(e){return [];}}"
                + "function text(el){return ((el.innerText||el.value||el.getAttribute('aria-label')||'')+'').toUpperCase();}"
                + "function meta(el){return ((el.id||'')+' '+(el.name||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')).toLowerCase();}"
                + "function dniLike(el){return /dni|documento/.test(meta(el));}"
                + "function codeLike(el){return /codigo|codig|matricula|matricul|c\\u00f3digo|matr\\u00edcula/.test(meta(el));}"
                + "var inputs=q('input').filter(function(el){var t=(el.type||'text').toLowerCase();return ['text','tel','number','search',''].indexOf(t)>=0;});"
                + "function first(list){return list.length?list[0]:null;}"
                + "var dniInput=first(q(" + JSONObject.quote(selectorCampo1) + "))||inputs.find(dniLike)||inputs[0]||null;"
                + "var codeInput=first(q(" + JSONObject.quote(selectorCampo2) + ").filter(function(el){return el!==dniInput;}))||inputs.find(function(el){return el!==dniInput&&codeLike(el);})||inputs.find(function(el){return el!==dniInput;})||null;"
                + "function setVal(el,val){if(!el)return false;el.focus();try{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,val);}catch(e){el.value=val;}"
                + "try{el.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertText',data:val}));}catch(e){el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));}"
                + "['change','keyup','keydown','blur'].forEach(function(name){try{el.dispatchEvent(new Event(name,{bubbles:true,cancelable:true}));}catch(e){}});return el.value==val;}"
                + "var okDni=setVal(dniInput," + JSONObject.quote(dni) + ");"
                + "var okCode=setVal(codeInput," + JSONObject.quote(codigo) + ");"
                + "var buttons=q(" + JSONObject.quote(selectorButton) + ").concat(q('button,input[type=\"submit\"],[role=\"button\"]'));"
                + "var btn=buttons.find(function(el){return /GENERAR|TICKET|REGISTRO|INICIAR/.test(text(el));})||buttons[0]||null;"
                + "var clicked=false;"
                + "if(" + shouldClick + "&&okDni&&okCode&&btn){try{btn.scrollIntoView({block:'center'});}catch(e){} btn.removeAttribute('disabled');btn.disabled=false;"
                + "['pointerdown','mousedown','mouseup','click'].forEach(function(name){try{btn.dispatchEvent(new MouseEvent(name,{bubbles:true,cancelable:true,view:window}));}catch(e){}});clicked=true;}"
                + "return 'dni='+(okDni?1:0)+';codigo='+(okCode?1:0)+';button='+(btn?1:0)+';clicked='+(clicked?1:0)+';disabled='+(btn&&btn.disabled?1:0);"
                + "})();";

        webView.evaluateJavascript(script, value -> {
            String result = cleanEval(value);
            boolean dniOk = result.contains("dni=1");
            boolean codeOk = result.contains("codigo=1");
            boolean buttonOk = result.contains("button=1");
            boolean clicked = result.contains("clicked=1");
            long now = System.currentTimeMillis();

            if (dniOk && codeOk && buttonOk && now - lastPrepareLogAt > 1200) {
                log("Formulario detectado: DNI, codigo y boton listos.");
                lastPrepareLogAt = now;
            } else if (now - lastPrepareLogAt > 1800) {
                log("Buscando campos... dni=" + dniOk + " codigo=" + codeOk + " boton=" + buttonOk);
                lastPrepareLogAt = now;
            }

            boolean formReady = dniOk && codeOk && buttonOk;
            boolean reloadWindow = System.currentTimeMillis() >= fireAt - 3000;
            boolean shouldReload = !formReady
                    && reloadWindow
                    && reloadAttempts < Math.max(4, maxAttempts * 2)
                    && System.currentTimeMillis() - lastReloadAt >= 700;
            if (shouldReload) {
                reloadAttempts += 1;
                lastReloadAt = System.currentTimeMillis();
                setStatus("REFRESCO #" + reloadAttempts);
                log("Refresco #" + reloadAttempts + ": esperando que aparezca el formulario.");
                webView.reload();
                return;
            }

            if (clicked) {
                clickAttempts += 1;
                setStatus("DISPARO #" + clickAttempts + " ENVIADO");
                log("Disparo #" + clickAttempts + " ejecutado.");
                handler.postDelayed(this::detectTicketResult, 900);
            }

            if (!stopped && !successDetected) {
                boolean beforeFire = System.currentTimeMillis() < fireAt;
                boolean canContinue = beforeFire || clickAttempts < maxAttempts;
                if (canContinue && System.currentTimeMillis() <= deadlineAt) {
                    handler.postDelayed(this::runAutomationTick, beforeFire ? 250 : intervalMs);
                } else {
                    setStatus("ESPERANDO RESPUESTA");
                    log("Intentos completados; esperando resultado visible.");
                    handler.postDelayed(this::detectTicketResult, 1800);
                    handler.postDelayed(this::captureTicket, 3500);
                }
            }
        });
    }

    private void detectTicketResult() {
        if (webView == null || stopped || successDetected) return;
        String script = "(function(){return (document.body && document.body.innerText || '').toUpperCase();})();";
        webView.evaluateJavascript(script, value -> {
            String text = cleanEval(value).toUpperCase(Locale.US);
            boolean success = text.contains("TICKET VIRTUAL")
                    || text.contains("TICKET GENERADO")
                    || text.contains("GENERADO EXITOSAMENTE")
                    || text.contains("IMPRIMIR TICKET")
                    || text.contains("REGISTRADO EXITOSAMENTE");
            boolean closed = text.contains("CUPOS AGOTADOS")
                    || text.contains("NO HAY CUPO")
                    || text.contains("NO HAY TICKET")
                    || (text.contains("REGISTRO") && text.contains("CERR"));
            if (success) {
                successDetected = true;
                setStatus("REGISTRADO EXITOSAMENTE");
                log("Resultado confirmado en la pagina oficial.");
                captureTicket();
                reportCreditUse();
            } else if (closed) {
                stopped = true;
                setStatus("SIN CUPO O CERRADO");
                log("La pagina oficial indica cierre, falta de cupos o ticket no disponible.");
                captureTicket();
            } else if (!successDetected && System.currentTimeMillis() <= deadlineAt) {
                handler.postDelayed(this::detectTicketResult, 1600);
            }
        });
    }

    private void reportCreditUse() {
        if (creditReported) return;
        creditReported = true;
        if (apiBase.isEmpty() || studentId.isEmpty()) {
            log("No se pudo reportar cupo: backend no configurado.");
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
                handler.post(() -> log(code >= 200 && code < 300 ? "Cupo actualizado en backend." : "Backend no desconto cupo. HTTP " + code));
                connection.disconnect();
            } catch (Exception error) {
                handler.post(() -> log("No se pudo conectar al backend para descontar cupo."));
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
            String fileName = "ticket-" + System.currentTimeMillis() + ".png";
            File file = new File(dir, fileName);
            FileOutputStream out = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            out.flush();
            out.close();
            boolean publicSaved = savePublicImage(bitmap, fileName);
            log(publicSaved ? "Captura guardada en Imagenes/AsistenteEstudiantes: " + fileName : "Captura guardada internamente: " + fileName);
        } catch (Exception error) {
            log("No se pudo guardar captura.");
        }
    }

    private boolean savePublicImage(Bitmap bitmap, String fileName) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AsistenteEstudiantes");
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return false;
                OutputStream out = getContentResolver().openOutputStream(uri);
                if (out == null) return false;
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
                out.flush();
                out.close();
                return true;
            }
            File dir = new File(getExternalFilesDir(null), "AsistenteEstudiantes");
            if (!dir.exists()) dir.mkdirs();
            File file = new File(dir, fileName);
            FileOutputStream out = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            out.flush();
            out.close();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private void setStatus(String status) {
        if (statusText != null) statusText.setText(status);
    }

    private void log(String message) {
        if (logText == null) return;
        logText.append(clock.format(new Date()) + "  " + message + "\n");
        if (logScroll != null) {
            logScroll.post(() -> logScroll.fullScroll(View.FOCUS_DOWN));
        }
    }

    private String cleanEval(String value) {
        if (value == null) return "";
        return value.replace("\\n", " ")
                .replace("\\\"", "\"")
                .replace("\"", "")
                .replace("\\\\", "\\");
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
