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
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
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
    private String directEndpoint;
    private String apiBase;
    private String studentId;
    private long fireAt;
    private long deadlineAt;
    private int maxAttempts;
    private int intervalMs;
    private long reloadWindowMs;
    private int clickAttempts = 0;
    private int reloadAttempts = 0;
    private long lastPrepareLogAt = 0;
    private long lastReloadAt = 0;
    private boolean stopped = false;
    private boolean successDetected = false;
    private boolean creditReported = false;
    private boolean pageLoading = false;
    private int postFireReloads = 0;
    private int directAttempts = 0;
    private long lastDirectAt = 0;
    private boolean directInFlight = false;

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
        selectorCampo1 = value(uri, "s1", "#dni, input[name=\"tl_dni\"], input[id*=\"dni\"], input[placeholder*=\"DNI\"], input[placeholder*=\"Documento\"]");
        selectorCampo2 = value(uri, "s2", "#codigo, #matricula, input[name*=\"codigo\"], input[name*=\"matricula\"], input[name*=\"tl_codigo\"], input[id*=\"codigo\"], input[id*=\"matricula\"], input[placeholder*=\"Codigo\"], input[placeholder*=\"igo\"], input[placeholder*=\"Matricula\"], input[placeholder*=\"atric\"]");
        selectorButton = value(uri, "button", ".btn-register, .btn.btn-success, button[type=\"submit\"], button.btn-success, button[class*=\"register\"], button[class*=\"success\"], button, input[type=\"submit\"]");
        directEndpoint = value(uri, "directEndpoint", "https://comensales.uncp.edu.pe/api/registros");
        apiBase = value(uri, "apiBase", "");
        studentId = value(uri, "studentId", "");
        fireAt = parseLong(value(uri, "fireAt", "0"), System.currentTimeMillis());
        maxAttempts = Math.max(1, (int) parseLong(value(uri, "maxAttempts", "10"), 10));
        intervalMs = Math.max(80, (int) parseLong(value(uri, "intervalMs", "120"), 120));
        reloadWindowMs = Math.max(0, parseLong(value(uri, "reloadWindowMs", "3000"), 3000));
        long timeoutMs = Math.max(90000, parseLong(value(uri, "timeoutMs", "120000"), 120000));
        deadlineAt = Math.max(System.currentTimeMillis() + timeoutMs, fireAt + timeoutMs);

        buildLayout();
        configureWebView();

        log("[App iniciada]");
        log("Inicializando sesion...");
        log("DNI y codigo recibidos.");
        if (fireAt > System.currentTimeMillis() + 500) {
            log("Preparando disparos para " + clock.format(new Date(fireAt)) + ".");
            log("Ventana configurable: " + reloadWindowMs + " ms antes, intervalo " + intervalMs + " ms, max " + maxAttempts + " intentos.");
            setStatus("PREPARANDO FORMULARIO");
        } else {
            log("Verificacion inmediata.");
            log("Intervalo " + intervalMs + " ms, max " + maxAttempts + " intentos.");
            setStatus("FORMULARIO EN PROCESO");
        }

        webView.loadUrl(targetUrl);
        handler.postDelayed(this::runAutomationTick, 350);
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageLoading = true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoading = false;
                log("Pagina oficial cargada.");
                handler.postDelayed(OfficialWebViewActivity.this::runAutomationTick, 80);
            }
        });
    }

    private void runAutomationTick() {
        if (stopped || successDetected) return;
        long now = System.currentTimeMillis();
        if (now > deadlineAt) {
            setStatus("SIN CONFIRMACION");
            log("Tiempo agotado: no se confirmo ticket ni mensaje de cierre tras la ventana extendida.");
            captureTicket();
            return;
        }
        boolean shouldClick = now >= fireAt && clickAttempts < maxAttempts;
        maybeRunDirectAttempt(now);
        fillAndMaybeClick(shouldClick);
    }

    private void maybeRunDirectAttempt(long now) {
        if (directEndpoint == null || directEndpoint.isEmpty()) return;
        if (stopped || successDetected || now < fireAt) return;
        if (directInFlight || directAttempts >= maxAttempts) return;
        if (now - lastDirectAt < Math.max(120, intervalMs)) return;

        directAttempts += 1;
        int attemptNo = directAttempts;
        lastDirectAt = now;
        directInFlight = true;
        setStatus("API DIRECTA #" + attemptNo);
        log("API directa #" + attemptNo + ": enviando registro oficial.");

        new Thread(() -> {
            DirectAttemptResult result = postOfficialRegistration();
            handler.post(() -> handleDirectAttemptResult(attemptNo, result));
        }).start();
    }

    private DirectAttemptResult postOfficialRegistration() {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(directEndpoint);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            int apiTimeout = Math.max(1200, Math.min(5000, intervalMs * 5));
            connection.setConnectTimeout(apiTimeout);
            connection.setReadTimeout(apiTimeout);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            connection.setDoOutput(true);

            JSONObject payload = new JSONObject();
            payload.put("t1_dni", dni);
            payload.put("t1_codigo", codigo);
            String body = "data=" + URLEncoder.encode(payload.toString(), "UTF-8");
            OutputStream out = connection.getOutputStream();
            out.write(body.getBytes("UTF-8"));
            out.flush();
            out.close();

            int httpCode = connection.getResponseCode();
            InputStream input = httpCode >= 200 && httpCode < 400 ? connection.getInputStream() : connection.getErrorStream();
            String text = readStream(input);
            int officialCode = -1;
            try {
                JSONObject json = new JSONObject(text);
                officialCode = json.optInt("code", -1);
            } catch (Exception ignored) {
            }
            return new DirectAttemptResult(httpCode, officialCode, text, null);
        } catch (Exception error) {
            return new DirectAttemptResult(0, -1, "", error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void handleDirectAttemptResult(int attemptNo, DirectAttemptResult result) {
        directInFlight = false;
        if (stopped || successDetected) return;

        if (result.error != null) {
            log("API directa #" + attemptNo + ": sin respuesta rapida (" + result.error + ").");
            return;
        }

        log("API directa #" + attemptNo + ": HTTP " + result.httpCode + ", code " + result.officialCode + ".");
        if (result.officialCode == 200 || result.officialCode == 201) {
            successDetected = true;
            setStatus("REGISTRADO EXITOSAMENTE");
            log("API directa confirmo ticket generado por la web oficial.");
            renderDirectTicket(result.body);
            reportCreditUse();
        } else if (result.officialCode == 300) {
            setStatus("FUERA DE HORARIO");
            log("API oficial indica fuera de horario; se seguira intentando dentro de la ventana.");
        } else if (result.officialCode == 400) {
            stopped = true;
            setStatus("ACCESO RESTRINGIDO");
            log("API oficial indica alumno restringido.");
            captureTicket();
        } else if (result.officialCode == 404) {
            stopped = true;
            setStatus("NO ENCONTRADO");
            log("API oficial indica DNI/codigo no encontrado.");
            captureTicket();
        } else if (result.officialCode == 500) {
            stopped = true;
            setStatus("CUPOS AGOTADOS");
            log("API oficial indica cupos agotados.");
            captureTicket();
        }
    }

    private void fillAndMaybeClick(boolean shouldClick) {
        String script = "(function(){"
                + "var targetDni=" + JSONObject.quote(dni) + ";"
                + "var targetCode=" + JSONObject.quote(codigo) + ";"
                + "function visible(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&(el.type||'').toLowerCase()!=='hidden';}"
                + "function q(sel){try{return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(visible);}catch(e){return [];}}"
                + "function text(el){return ((el.innerText||el.value||el.getAttribute('aria-label')||'')+'').toUpperCase();}"
                + "function meta(el){return ((el.id||'')+' '+(el.name||'')+' '+(el.placeholder||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.className||'')).toLowerCase();}"
                + "function dniLike(el){return /dni|documento|identity/.test(meta(el));}"
                + "function codeLike(el){return /codigo|codig|matricula|matricul|c\\u00f3digo|matr\\u00edcula|code/.test(meta(el));}"
                + "var inputs=q('input,textarea').filter(function(el){var t=(el.type||'text').toLowerCase();return ['text','tel','number','search',''].indexOf(t)>=0;});"
                + "function first(list){return list.length?list[0]:null;}"
                + "var dniInput=first(q(" + JSONObject.quote(selectorCampo1) + "))||inputs.find(dniLike)||inputs[0]||null;"
                + "var codeInput=first(q(" + JSONObject.quote(selectorCampo2) + ").filter(function(el){return el!==dniInput;}))||inputs.find(function(el){return el!==dniInput&&codeLike(el);})||inputs.find(function(el){return el!==dniInput;})||null;"
                + "function setVal(el,val){if(!el)return false;try{el.removeAttribute('readonly');el.removeAttribute('disabled');el.readOnly=false;el.disabled=false;}catch(e){}"
                + "try{el.focus();}catch(e){}"
                + "var desc=null;try{desc=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value')||Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value');}catch(e){}"
                + "try{if(el._valueTracker)el._valueTracker.setValue('');}catch(e){}"
                + "try{if(desc&&desc.set){desc.set.call(el,'');desc.set.call(el,val);}else{el.value='';el.value=val;}}catch(e){el.value='';el.value=val;}"
                + "try{el.setAttribute('value',val);}catch(e){}"
                + "try{el.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertText',data:val}));}catch(e){try{el.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));}catch(x){}}"
                + "['change','keyup','keydown','blur'].forEach(function(name){try{el.dispatchEvent(new Event(name,{bubbles:true,cancelable:true}));}catch(e){}});"
                + "return String(el.value||'').toLowerCase()===String(val).toLowerCase();}"
                + "var foundDni=!!dniInput;"
                + "var foundCode=!!codeInput;"
                + "var okDni=setVal(dniInput,targetDni);"
                + "var okCode=setVal(codeInput,targetCode);"
                + "var buttons=q(" + JSONObject.quote(selectorButton) + ").concat(q('button,input[type=\"submit\"],[role=\"button\"]'));"
                + "buttons=buttons.filter(function(el,i,arr){return arr.indexOf(el)===i;});"
                + "var btn=buttons.find(function(el){return /GENERAR|TICKET|REGISTRO|INICIAR/.test(text(el));})||buttons[0]||null;"
                + "var foundButton=!!btn;"
                + "var clicked=false;"
                + "if(" + shouldClick + "&&foundDni&&foundCode){if(btn){try{btn.scrollIntoView({block:'center'});}catch(e){} try{btn.removeAttribute('disabled');btn.disabled=false;btn.classList.remove('disabled');}catch(e){}"
                + "['touchstart','pointerdown','mousedown','mouseup','click'].forEach(function(name){try{btn.dispatchEvent(new MouseEvent(name,{bubbles:true,cancelable:true,view:window}));}catch(e){}});clicked=true;}"
                + "if(!clicked){var form=(dniInput&&dniInput.form)||(codeInput&&codeInput.form)||document.querySelector('form');if(form){try{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}catch(e){} try{if(form.requestSubmit)form.requestSubmit();}catch(e){} clicked=true;}}}"
                + "return 'foundDni='+(foundDni?1:0)+';foundCode='+(foundCode?1:0)+';dni='+(okDni?1:0)+';codigo='+(okCode?1:0)+';button='+(foundButton?1:0)+';clicked='+(clicked?1:0)+';disabled='+(btn&&btn.disabled?1:0);"
                + "})();";

        webView.evaluateJavascript(script, value -> {
            String result = cleanEval(value);
            boolean foundDni = result.contains("foundDni=1");
            boolean foundCode = result.contains("foundCode=1");
            boolean dniOk = result.contains("dni=1");
            boolean codeOk = result.contains("codigo=1");
            boolean buttonOk = result.contains("button=1");
            boolean clicked = result.contains("clicked=1");
            long now = System.currentTimeMillis();

            if (dniOk && codeOk && buttonOk && now - lastPrepareLogAt > 1200) {
                log("Formulario detectado: DNI, codigo y boton listos.");
                lastPrepareLogAt = now;
            } else if (foundDni && foundCode && now - lastPrepareLogAt > 1200) {
                log("Campos encontrados; reintentando escritura y activacion del boton.");
                lastPrepareLogAt = now;
            } else if (now - lastPrepareLogAt > 1800) {
                log("Buscando campos... dni=" + foundDni + "/" + dniOk + " codigo=" + foundCode + "/" + codeOk + " boton=" + buttonOk);
                lastPrepareLogAt = now;
            }

            boolean formVisible = foundDni && foundCode;
            boolean beforeFire = now < fireAt;
            boolean reloadWindow = now >= fireAt - reloadWindowMs;
            boolean beforeFireReload = !formVisible
                    && beforeFire
                    && reloadWindow
                    && !pageLoading
                    && reloadAttempts < maxAttempts
                    && now - lastReloadAt >= intervalMs;
            boolean openingReload = !formVisible
                    && !beforeFire
                    && !pageLoading
                    && reloadAttempts < maxAttempts
                    && lastReloadAt < fireAt
                    && now - lastReloadAt >= Math.max(250, intervalMs);
            boolean recoveryReload = !formVisible
                    && !beforeFire
                    && !pageLoading
                    && postFireReloads < 3
                    && reloadAttempts < maxAttempts
                    && now - fireAt > 2500
                    && now - lastReloadAt >= Math.max(1500, intervalMs * 4L);
            boolean shouldReload = beforeFireReload || openingReload || recoveryReload;
            if (shouldReload) {
                reloadAttempts += 1;
                if (!beforeFire) postFireReloads += 1;
                lastReloadAt = System.currentTimeMillis();
                setStatus("REFRESCO #" + reloadAttempts);
                log((beforeFire ? "Refresco previo #" : "Refresco de apertura #") + reloadAttempts + ": esperando formulario.");
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
                boolean canContinue = beforeFire || clickAttempts < maxAttempts;
                if (canContinue && System.currentTimeMillis() <= deadlineAt) {
                    handler.postDelayed(this::runAutomationTick, beforeFire ? 250 : Math.max(120, intervalMs));
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
                    || text.contains("0 CUPOS DISPONIBLES")
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

    private void renderDirectTicket(String body) {
        try {
            JSONObject ticket = new JSONObject(body);
            String ticketId = ticket.optString("t2_id", ticket.optString("id", ""));
            String ticketCode = ticket.optString("t2_codigo", ticket.optString("codigo", ""));
            String ticketDni = ticket.optString("t1_dni", dni);
            String ticketStudentCode = ticket.optString("t1_codigo", codigo);
            String names = ticket.optString("t1_nombres", "");
            String career = ticket.optString("t1_escuela", "");
            String title = ticketId.isEmpty() ? "TICKET VIRTUAL" : "TICKET VIRTUAL #" + escapeHtml(ticketId);
            String html = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                    + "<style>body{margin:0;background:#1f4c8f;font-family:Arial,sans-serif;color:#1f2937}.card{margin:18px auto;max-width:620px;background:#f8fafc;border-radius:18px;overflow:hidden;border:3px solid #1fbf75}.head{background:linear-gradient(135deg,#22b455,#21c8a4);color:#fff;text-align:center;padding:28px 18px}.head h1{margin:0;font-size:28px}.notice{display:inline-block;margin-top:12px;background:#ffffff33;padding:8px 16px;border-radius:20px}.body{padding:24px}.barcode{background:white;border-radius:12px;padding:22px;margin:0 auto 24px;text-align:center;box-shadow:0 6px 18px #0002;font-size:22px;letter-spacing:3px}.row{background:white;border-left:5px solid #22b455;margin:12px 0;padding:14px;border-radius:10px}.label{font-weight:700;color:#64748b;font-size:13px;text-transform:uppercase}.value{font-size:18px;margin-top:8px}.ok{background:#d8f3e6;border-radius:10px;padding:18px;margin-top:22px}.ok strong{color:#0f5132}</style></head><body>"
                    + "<div class=\"card\"><div class=\"head\"><h1>" + title + "</h1><div class=\"notice\">No compartas este codigo con nadie</div></div>"
                    + "<div class=\"body\"><div class=\"barcode\">" + escapeHtml(ticketCode.isEmpty() ? ticketId : ticketCode) + "</div>"
                    + ticketRow("DNI", ticketDni)
                    + ticketRow("Codigo", ticketStudentCode)
                    + ticketRow("Nombres y Apellidos", names)
                    + ticketRow("Carrera Profesional", career)
                    + "<div class=\"ok\"><strong>Ticket generado exitosamente.</strong><br>Guarda esta captura y presentala con tu documento al ingresar.</div>"
                    + "</div></div></body></html>";
            webView.loadDataWithBaseURL("https://comedor.uncp.edu.pe/", html, "text/html", "UTF-8", null);
            handler.postDelayed(this::captureTicket, 900);
        } catch (Exception error) {
            log("Ticket confirmado, pero no se pudo renderizar comprobante local.");
            captureTicket();
        }
    }

    private String ticketRow(String label, String value) {
        return "<div class=\"row\"><div class=\"label\">" + escapeHtml(label) + "</div><div class=\"value\">" + escapeHtml(value) + "</div></div>";
    }

    private String escapeHtml(String value) {
        return String.valueOf(value == null ? "" : value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
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

    private String readStream(InputStream input) throws Exception {
        if (input == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            builder.append(line).append('\n');
        }
        reader.close();
        return builder.toString();
    }

    private static class DirectAttemptResult {
        final int httpCode;
        final int officialCode;
        final String body;
        final String error;

        DirectAttemptResult(int httpCode, int officialCode, String body, String error) {
            this.httpCode = httpCode;
            this.officialCode = officialCode;
            this.body = body == null ? "" : body;
            this.error = error;
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
