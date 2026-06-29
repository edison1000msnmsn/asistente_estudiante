package pe.edu.uncp.asistenteestudiantes;

import android.app.Activity;
import android.annotation.TargetApi;
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
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class OfficialWebViewActivity extends Activity {
    private static final long[] FORM_RECOVERY_DELAYS_MS = {0, 1400, 3200, 6500, 11000};
    private static final long[] PRELOAD_RECOVERY_DELAYS_MS = {900, 2500, 6000};
    private static final long[] SECURITY_RECOVERY_DELAYS_MS = {450, 1100, 2400};
    private static final long CLOSED_GRACE_MS = 8000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat clock = new SimpleDateFormat("HH:mm:ss", Locale.US);
    private final ExecutorService reportExecutor = Executors.newSingleThreadExecutor();

    private WebView webView;
    private TextView statusText;
    private TextView logText;
    private ScrollView logScroll;

    private String dni;
    private String codigo;
    private String apiBase;
    private String preparationId;
    private String reportToken;
    private String purpose;
    private String targetUrl;
    private long fireAt;
    private long deadlineAt;
    private long clockOffsetMs;
    private boolean autoSubmit;
    private boolean stopped = false;
    private boolean submitted = false;
    private boolean terminal = false;
    private boolean pageLoaded = false;
    private boolean inspectionInFlight = false;
    private boolean formSeen = false;
    private boolean formVisible = false;
    private boolean securityReadySeen = false;
    private boolean mainFrameLoadFailed = false;
    private boolean preloadRecoveryScheduled = false;
    private boolean securityRecoveryScheduled = false;
    private int preloadRecoveryAttempt = 0;
    private int securityRecoveryAttempt = 0;
    private int recoveryAttempt = 0;
    private long pageLoadStartedAt = 0;
    private String lastReportedStatus = "";
    private String lastUiStatus = "";
    private long lastLogAt = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Uri uri = getIntent().getData();
        if (uri == null) {
            finish();
            return;
        }

        targetUrl = value(uri, "url", "https://comedor.uncp.edu.pe/charola");
        dni = value(uri, "dni", "");
        codigo = value(uri, "codigo", "");
        apiBase = value(uri, "apiBase", "");
        preparationId = value(uri, "preparationId", "");
        reportToken = value(uri, "reportToken", "");
        purpose = value(uri, "purpose", "registration");
        fireAt = parseLong(value(uri, "fireAt", "0"), System.currentTimeMillis());
        deadlineAt = parseLong(value(uri, "deadlineAt", "0"), fireAt + 300000);
        clockOffsetMs = parseLong(value(uri, "clockOffsetMs", "0"), 0);
        autoSubmit = !"0".equals(value(uri, "autoSubmit", "1"));

        buildLayout();
        configureWebView();

        log("[Sesion segura iniciada]");
        log("La pagina oficial controlara Turnstile, CSRF y fingerprint.");
        log("La app conservara cookies y usara solo la sesion oficial.");
        if ("verify".equals(purpose)) {
            log("Modo verificacion inmediata.");
        } else {
            log("Envio unico objetivo: " + clock.format(new Date(fireAt)) + ".");
        }
        setUiStatus("CARGANDO PAGINA OFICIAL");
        reportStatus("page_loading", "Cargando la pagina oficial.", null);

        webView.loadUrl(targetUrl);
        handler.postDelayed(this::runSecureTick, 350);
        scheduleExactTargetWakeup();
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(25, 39, 55));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(18), dp(10), dp(18), dp(8));
        header.setBackgroundColor(Color.rgb(222, 248, 246));
        TextView title = new TextView(this);
        title.setText("COMEDOR UNCP");
        title.setTextColor(Color.rgb(26, 116, 133));
        title.setTextSize(20);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        TextView subtitle = new TextView(this);
        subtitle.setText("Sesion oficial protegida");
        subtitle.setTextColor(Color.rgb(84, 108, 122));
        subtitle.setTextSize(12);
        header.addView(title);
        header.addView(subtitle);
        root.addView(header);

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                2.55f
        ));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(14), dp(12), dp(14), dp(12));
        controls.setBackgroundColor(Color.rgb(25, 39, 55));

        statusText = new TextView(this);
        statusText.setText("INICIANDO");
        statusText.setTextColor(Color.rgb(53, 205, 166));
        statusText.setTextSize(14);
        statusText.setGravity(Gravity.CENTER_VERTICAL);
        statusText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        statusText.setPadding(dp(12), 0, dp(12), 0);
        statusText.setBackgroundColor(Color.rgb(235, 252, 248));
        controls.addView(statusText, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(46)
        ));

        Button stopButton = new Button(this);
        stopButton.setText("DETENER SESION");
        stopButton.setTextColor(Color.rgb(220, 75, 78));
        stopButton.setBackgroundColor(Color.TRANSPARENT);
        stopButton.setOnClickListener(v -> {
            stopped = true;
            setUiStatus("SESION DETENIDA");
            reportStatus("cancelled", "Sesion detenida por el usuario.", null);
        });
        controls.addView(stopButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(46)
        ));

        TextView logTitle = new TextView(this);
        logTitle.setText("Actividad de la sesion");
        logTitle.setTextColor(Color.rgb(164, 183, 195));
        logTitle.setTextSize(12);
        controls.addView(logTitle);

        logText = new TextView(this);
        logText.setTextColor(Color.rgb(174, 235, 216));
        logText.setTextSize(12);
        logText.setPadding(dp(12), dp(10), dp(12), dp(10));
        logText.setTypeface(android.graphics.Typeface.MONOSPACE);
        logText.setBackgroundColor(Color.rgb(13, 25, 38));
        logScroll = new ScrollView(this);
        logScroll.addView(logText);
        controls.addView(logScroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        root.addView(controls, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1.15f
        ));
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) settings.setOffscreenPreRaster(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageLoaded = false;
                mainFrameLoadFailed = false;
                pageLoadStartedAt = correctedNow();
                setUiStatus("CARGANDO PAGINA OFICIAL");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (mainFrameLoadFailed) {
                    pageLoaded = false;
                    schedulePreloadRecovery();
                    return;
                }
                pageLoaded = true;
                CookieManager.getInstance().flush();
                log("Pagina oficial cargada. Se conserva esta misma sesion.");
                handler.postDelayed(OfficialWebViewActivity.this::runSecureTick, 120);
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                        && failingUrl != null
                        && failingUrl.startsWith(originOf(targetUrl))) {
                    handleMainFrameLoadFailure("La pagina oficial no respondio; se aplicara recuperacion controlada.");
                }
            }

            @Override
            @TargetApi(Build.VERSION_CODES.M)
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    handleMainFrameLoadFailure("La pagina oficial no respondio; se aplicara recuperacion controlada.");
                }
            }

            private void handleMainFrameLoadFailure(String message) {
                if (!terminal && !stopped) {
                    pageLoaded = false;
                    mainFrameLoadFailed = true;
                    setUiStatus("RECUPERANDO CONEXION");
                    occasionalLog(message);
                    schedulePreloadRecovery();
                    handler.postDelayed(OfficialWebViewActivity.this::runSecureTick, 250);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                    pageLoaded = false;
                    mainFrameLoadFailed = true;
                    setUiStatus("SERVIDOR OFICIAL OCUPADO");
                    occasionalLog("Servidor oficial ocupado: HTTP " + response.getStatusCode() + ".");
                    schedulePreloadRecovery();
                    handler.postDelayed(OfficialWebViewActivity.this::runSecureTick, 250);
                }
            }
        });
    }

    private long correctedNow() {
        return System.currentTimeMillis() + clockOffsetMs;
    }

    private void scheduleExactTargetWakeup() {
        long delay = Math.max(0, fireAt - correctedNow());
        handler.postDelayed(() -> {
            if (stopped || terminal) return;
            log("Hora objetivo alcanzada; comprobando la sesion precargada.");
            runSecureTick();
        }, delay);
    }

    private void schedulePreloadRecovery() {
        if (preloadRecoveryScheduled || stopped || terminal || correctedNow() >= fireAt) return;
        if (preloadRecoveryAttempt >= PRELOAD_RECOVERY_DELAYS_MS.length) return;
        long delay = PRELOAD_RECOVERY_DELAYS_MS[preloadRecoveryAttempt];
        preloadRecoveryScheduled = true;
        handler.postDelayed(() -> {
            preloadRecoveryScheduled = false;
            if (stopped || terminal || correctedNow() >= fireAt || pageLoaded || !mainFrameLoadFailed) return;
            preloadRecoveryAttempt += 1;
            mainFrameLoadFailed = false;
            pageLoadStartedAt = correctedNow();
            setUiStatus("RECUPERANDO PRECARGA");
            log("Reintento de precarga " + preloadRecoveryAttempt + "/" + PRELOAD_RECOVERY_DELAYS_MS.length + ".");
            webView.loadUrl(targetUrl);
        }, delay);
    }

    private void runSecureTick() {
        if (stopped || terminal || webView == null) return;
        long now = correctedNow();
        if (now > deadlineAt) {
            terminal = true;
            String finalStatus;
            String message;
            if (submitted) {
                finalStatus = "timeout";
                message = "La pagina oficial no confirmo un resultado antes del limite.";
            } else if (formSeen && !securityReadySeen) {
                finalStatus = "manual_required";
                message = "La validacion de seguridad no estuvo lista antes del limite.";
            } else {
                finalStatus = "closed";
                message = "La pagina oficial no habilito el formulario antes del limite.";
            }
            setUiStatus("SIN CONFIRMACION");
            log(message);
            reportStatus(finalStatus, message, null);
            capturePage();
            return;
        }
        if (inspectionInFlight) {
            handler.postDelayed(this::runSecureTick, 80);
            return;
        }
        inspectAndPrepare(now >= fireAt);
    }

    private void inspectAndPrepare(boolean targetReached) {
        inspectionInFlight = true;
        String script = "(function(){"
                + "function visible(el){if(!el)return false;var r=el.getBoundingClientRect();var s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}"
                + "function find(selectors){for(var i=0;i<selectors.length;i++){var el=document.querySelector(selectors[i]);if(el)return el;}return null;}"
                + "function plain(value){var s=String(value||'');return s.normalize?s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,''):s;}"
                + "function inputByPlaceholder(word){var list=document.querySelectorAll('input');for(var i=0;i<list.length;i++){if(plain(list[i].placeholder).toUpperCase().indexOf(word)>=0)return list[i];}return null;}"
                + "function setValue(el,val){if(!el)return false;if(String(el.value||'').toUpperCase()===String(val).toUpperCase())return true;var p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');if(p&&p.set)p.set.call(el,val);else el.value=val;var ev;try{ev=new InputEvent('input',{bubbles:true,inputType:'insertText',data:val});}catch(e){ev=new Event('input',{bubbles:true});}el.dispatchEvent(ev);el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));return String(el.value||'').toUpperCase()===String(val).toUpperCase();}"
                + "function buttonByText(){var list=document.querySelectorAll('button,input[type=\"submit\"]');for(var i=0;i<list.length;i++){var t=(list[i].innerText||list[i].value||'').trim();if(/GENERAR\\s+(EL\\s+)?TICKET/i.test(t))return list[i];}return null;}"
                + "var dni=find(['#dni','input[name=\"t1_dni\"]','input[name=\"dni\"]','input[formcontrolname=\"dni\"]','input[placeholder*=\"DNI\" i]']);"
                + "var codigo=find(['#codigo','input[name=\"t1_codigo\"]','input[name=\"codigo\"]','input[formcontrolname=\"codigo\"]'])||inputByPlaceholder('MATRICULA')||inputByPlaceholder('CODIGO');"
                + "var button=find(['.btn-register','form button[type=\"submit\"]','button[type=\"submit\"]'])||buttonByText();"
                + "var form=!!(dni&&codigo&&visible(dni)&&visible(codigo));"
                + "var dniOk=form&&setValue(dni," + JSONObject.quote(dni) + ");"
                + "var codeOk=form&&setValue(codigo," + JSONObject.quote(codigo) + ");"
                + "var tokenEl=document.querySelector('[name=\"cf-turnstile-response\"],textarea[id^=\"cf-chl-widget-\"]');"
                + "var token=tokenEl&&String(tokenEl.value||tokenEl.textContent||tokenEl.getAttribute('value')||'').trim()||'';"
                + "var challengeFrames=Array.prototype.filter.call(document.querySelectorAll('iframe'),function(f){var s=(f.src||'')+' '+(f.title||'');return /cloudflare|challenge|turnstile/i.test(s);});"
                + "var securityPresent=!!tokenEl||challengeFrames.length>0||!!document.querySelector('.cf-turnstile,[data-sitekey]');"
                + "var securityReady=token.length>20||!securityPresent;"
                + "var challenge=challengeFrames.some(function(f){return visible(f);});"
                + "var bodyText=(document.body&&document.body.innerText||'').slice(0,20000);"
                + "var upper=bodyText.toUpperCase();"
                + "var normalizedUpper=plain(upper);"
                + "var ticketDetected=/TICKET\\s+VIRTUAL\\s*#|TICKET\\s+GENERADO\\s+EXITOSAMENTE|GENERADO\\s+EXITOSAMENTE|IMPRIMIR\\s+TICKET/.test(upper);"
                + "var sessionNotReady=/LA\\s+SESION\\s+AUN\\s+NO\\s+ESTA\\s+LISTA|SESION\\s+NO\\s+ESTA\\s+LISTA/.test(normalizedUpper);"
                + "var clicked=false;"
                + "var disabled=!!(button&&(button.disabled||button.getAttribute('aria-disabled')==='true'));"
                + "if(" + targetReached + "&&" + autoSubmit + "&&" + (!submitted) + "&&!sessionNotReady&&form&&dniOk&&codeOk&&securityReady&&button&&!disabled&&!window.__asistenteSubmitted){window.__asistenteSubmitted=true;button.click();clicked=true;}"
                + "return JSON.stringify({form:form,dniOk:dniOk,codeOk:codeOk,button:!!button,buttonDisabled:disabled,securityPresent:securityPresent,securityReady:securityReady,challenge:challenge,clicked:clicked,ticketDetected:ticketDetected,sessionNotReady:sessionNotReady,text:bodyText,url:location.href,title:document.title||''});"
                + "})();";

        webView.evaluateJavascript(script, raw -> {
            inspectionInFlight = false;
            if (stopped || terminal) return;
            try {
                String decoded = String.valueOf(new JSONTokener(raw).nextValue());
                JSONObject state = new JSONObject(decoded);
                String text = state.optString("text", "").toUpperCase(Locale.US);

                String terminalStatus = state.optBoolean("ticketDetected")
                        ? ("verify".equals(purpose) ? "already_issued" : "success")
                        : detectTerminalStatus(text);
                boolean reachedNow = correctedNow() >= fireAt;
                if (terminalStatus != null && shouldDeferTerminal(terminalStatus, reachedNow)) {
                    terminalStatus = null;
                    maybeRecoverForm();
                }
                if (terminalStatus != null) {
                    terminal = true;
                    String message = terminalMessage(terminalStatus);
                    setUiStatus(prettyStatus(terminalStatus));
                    log(message);
                    JSONObject ticket = isSuccessStatus(terminalStatus) ? extractTicketSummary(text) : null;
                    reportStatus(terminalStatus, message, ticket);
                    capturePage();
                    return;
                }

                if (state.optBoolean("sessionNotReady")) {
                    formVisible = state.optBoolean("form");
                    scheduleSecurityRecovery();
                    if (!stopped && !terminal) handler.postDelayed(this::runSecureTick, 250);
                    return;
                }

                boolean form = state.optBoolean("form");
                boolean securityReady = state.optBoolean("securityReady");
                boolean challenge = state.optBoolean("challenge");
                boolean clicked = state.optBoolean("clicked");
                formVisible = form;
                formSeen = formSeen || form;
                securityReadySeen = securityReadySeen || securityReady;

                if (clicked && !submitted) {
                    submitted = true;
                    setUiStatus("SOLICITUD ENVIADA");
                    log("Formulario oficial enviado una sola vez.");
                    reportStatus("submitted", "Solicitud oficial enviada.", null);
                } else if (!pageLoaded) {
                    setUiStatus("CARGANDO PAGINA");
                } else if (submitted) {
                    setUiStatus("ESPERANDO RESPUESTA OFICIAL");
                    occasionalLog("Solicitud enviada; esperando confirmacion oficial.");
                } else if (!form) {
                    setUiStatus("ESPERANDO FORMULARIO");
                    reportStatus("form_waiting", "Esperando que la web oficial habilite el formulario.", null);
                    occasionalLog("Esperando que aparezca el formulario oficial.");
                    if (reachedNow) maybeRecoverForm();
                } else if (!securityReady) {
                    setUiStatus("VALIDANDO SEGURIDAD");
                    JSONObject details = new JSONObject();
                    details.put("challengeVisible", challenge);
                    reportStatus("security_pending", "Esperando validacion de seguridad de Cloudflare.", details);
                    occasionalLog("Cloudflare esta validando la sesion.");
                } else if (!reachedNow) {
                    setUiStatus("SEGURIDAD LISTA");
                    reportStatus("security_ready", "Turnstile listo; esperando la hora objetivo.", null);
                    occasionalLog("Sesion y validacion listas. Esperando la hora objetivo.");
                } else if (!submitted) {
                    setUiStatus("LISTO PARA ENVIAR");
                    reportStatus("ready_to_submit", "Formulario listo para el envio unico.", null);
                    occasionalLog("Formulario listo; esperando que el boton oficial quede habilitado.");
                }
            } catch (Exception error) {
                occasionalLog("Esperando que Angular termine de renderizar.");
                if (correctedNow() >= fireAt) maybeRecoverForm();
            }

            if (!stopped && !terminal) handler.postDelayed(this::runSecureTick, submitted ? 450 : 180);
        });
    }

    private void maybeRecoverForm() {
        if (stopped || terminal || submitted || formVisible || correctedNow() < fireAt) return;
        if (recoveryAttempt >= FORM_RECOVERY_DELAYS_MS.length) return;

        long now = correctedNow();
        long dueAt = fireAt + FORM_RECOVERY_DELAYS_MS[recoveryAttempt];
        if (now < dueAt) return;
        if (!pageLoaded && !mainFrameLoadFailed && pageLoadStartedAt > 0 && now - pageLoadStartedAt < 6000) return;

        recoveryAttempt += 1;
        mainFrameLoadFailed = false;
        pageLoaded = false;
        pageLoadStartedAt = now;
        setUiStatus("ACTUALIZANDO FORMULARIO");
        log("Actualizacion controlada " + recoveryAttempt + "/" + FORM_RECOVERY_DELAYS_MS.length + ".");
        String currentUrl = webView.getUrl();
        if (currentUrl == null || !currentUrl.startsWith(originOf(targetUrl))) webView.loadUrl(targetUrl);
        else webView.reload();
    }

    private void scheduleSecurityRecovery() {
        if (securityRecoveryScheduled || stopped || terminal) return;
        if (securityRecoveryAttempt >= SECURITY_RECOVERY_DELAYS_MS.length) {
            setUiStatus("SESION OFICIAL NO LISTA");
            occasionalLog("La pagina oficial sigue sin habilitar su sesion interna.");
            return;
        }

        int nextAttempt = securityRecoveryAttempt + 1;
        long delay = SECURITY_RECOVERY_DELAYS_MS[securityRecoveryAttempt];
        securityRecoveryScheduled = true;
        setUiStatus("RENOVANDO SESION SEGURA");
        JSONObject details = new JSONObject();
        try {
            details.put("recoveryAttempt", nextAttempt);
        } catch (Exception ignored) {
        }
        reportStatus("security_retry", "La pagina oficial solicito renovar su sesion de seguridad.", details);
        log("Sesion oficial no lista; renovacion " + nextAttempt + "/" + SECURITY_RECOVERY_DELAYS_MS.length + ".");

        handler.postDelayed(() -> {
            securityRecoveryScheduled = false;
            if (stopped || terminal || webView == null) return;
            securityRecoveryAttempt = nextAttempt;
            submitted = false;
            securityReadySeen = false;
            formVisible = false;
            pageLoaded = false;
            mainFrameLoadFailed = false;
            pageLoadStartedAt = correctedNow();
            webView.reload();
        }, delay);
    }

    private boolean shouldDeferTerminal(String status, boolean targetReached) {
        if (!"registration".equals(purpose)) return false;
        if (!targetReached) return true;
        if (!submitted && recoveryAttempt == 0) return true;
        return "closed".equals(status)
                && correctedNow() - fireAt < CLOSED_GRACE_MS
                && recoveryAttempt < FORM_RECOVERY_DELAYS_MS.length;
    }

    private boolean isSuccessStatus(String status) {
        return "success".equals(status) || "already_issued".equals(status);
    }

    private String detectTerminalStatus(String text) {
        if (text.contains("TICKET VIRTUAL #")
                || text.contains("TICKET GENERADO EXITOSAMENTE")
                || text.contains("GENERADO EXITOSAMENTE")
                || text.contains("IMPRIMIR TICKET")
                || text.contains("DESCARGAR TICKET")) {
            return "verify".equals(purpose) ? "already_issued" : "success";
        }
        if (text.contains("CUPOS AGOTADOS")
                || text.contains("SIN CUPOS DISPONIBLES")
                || text.contains("NO QUEDAN CUPOS")
                || text.contains("CUPOS DISPONIBLES: 0")) return "sold_out";
        if (text.contains("USUARIO NO ENCONTRADO")
                || text.contains("ALUMNO NO ENCONTRADO")
                || text.contains("ESTUDIANTE NO EXISTE")
                || text.contains("NO MATRICULADO")) return "invalid_student";
        if (text.contains("USUARIO RESTRINGIDO")
                || text.contains("ACCESO RESTRINGIDO")) return "restricted";
        if (text.contains("FUERA DE HORARIO")
                || text.contains("REGISTRO CERRADO")
                || text.contains("FORMULARIO CERRADO")) return "closed";
        return null;
    }

    private String terminalMessage(String status) {
        switch (status) {
            case "success":
                return "La pagina oficial confirmo el ticket.";
            case "already_issued":
                return "La pagina oficial recupero un ticket ya emitido.";
            case "sold_out":
                return "La pagina oficial informa que no quedan cupos.";
            case "invalid_student":
                return "DNI o codigo no reconocido por la pagina oficial.";
            case "restricted":
                return "La pagina oficial restringio al alumno.";
            case "closed":
                return "El registro oficial esta cerrado.";
            default:
                return "Sesion finalizada.";
        }
    }

    private String prettyStatus(String status) {
        return status.replace('_', ' ').toUpperCase(Locale.US);
    }

    private JSONObject extractTicketSummary(String text) {
        JSONObject ticket = new JSONObject();
        try {
            ticket.put("confirmed", true);
            ticket.put("dni", dni);
            ticket.put("codigo", codigo);
            ticket.put("capturedAtEpochMs", System.currentTimeMillis());
            Matcher matcher = Pattern.compile("TICKET\\s+VIRTUAL\\s*#?\\s*(\\d+)", Pattern.CASE_INSENSITIVE).matcher(text);
            if (matcher.find()) ticket.put("ticketNumber", matcher.group(1));
        } catch (Exception ignored) {
        }
        return ticket;
    }

    private void reportStatus(String status, String message, JSONObject details) {
        if (preparationId.isEmpty() || reportToken.isEmpty() || apiBase.isEmpty()) return;
        if (status.equals(lastReportedStatus) && !status.equals("submitted")) return;
        lastReportedStatus = status;

        reportExecutor.execute(() -> {
            int maxTries = isTerminalStatus(status) ? 4 : 1;
            for (int attempt = 1; attempt <= maxTries; attempt++) {
                HttpURLConnection connection = null;
                try {
                    String normalizedBase = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
                    URL url = new URL(normalizedBase + "/api/preparations/" + preparationId + "/report");
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(3000);
                    connection.setReadTimeout(3000);
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setRequestProperty("X-Preparation-Token", reportToken);
                    connection.setDoOutput(true);

                    JSONObject body = new JSONObject();
                    body.put("status", status);
                    body.put("message", message);
                    if (details != null) {
                        if (isSuccessStatus(status)) body.put("ticket", details);
                        else body.put("details", details);
                    }
                    OutputStream out = connection.getOutputStream();
                    out.write(body.toString().getBytes("UTF-8"));
                    out.flush();
                    out.close();
                    int responseCode = connection.getResponseCode();
                    readStream(responseCode < 400 ? connection.getInputStream() : connection.getErrorStream());
                    if (responseCode < 500) return;
                } catch (Exception ignored) {
                    // A terminal result is retried below without interrupting the official page.
                } finally {
                    if (connection != null) connection.disconnect();
                }
                if (attempt < maxTries) {
                    try {
                        Thread.sleep(350L * attempt);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
            handler.post(() -> occasionalLog("Sin conexion con Railway; el resultado queda visible en la sesion oficial."));
        });
    }

    private boolean isTerminalStatus(String status) {
        return isSuccessStatus(status)
                || "sold_out".equals(status)
                || "closed".equals(status)
                || "invalid_student".equals(status)
                || "restricted".equals(status)
                || "manual_required".equals(status)
                || "timeout".equals(status)
                || "cancelled".equals(status)
                || "failed".equals(status);
    }

    private void capturePage() {
        handler.postDelayed(() -> {
            try {
                if (webView.getWidth() <= 0 || webView.getHeight() <= 0) return;
                Bitmap bitmap = Bitmap.createBitmap(webView.getWidth(), webView.getHeight(), Bitmap.Config.ARGB_8888);
                android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
                webView.draw(canvas);
                String fileName = "ticket-" + System.currentTimeMillis() + ".png";
                File internalDir = new File(getFilesDir(), "tickets");
                if (!internalDir.exists()) internalDir.mkdirs();
                FileOutputStream internal = new FileOutputStream(new File(internalDir, fileName));
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, internal);
                internal.close();
                boolean publicSaved = savePublicImage(bitmap, fileName);
                log(publicSaved
                        ? "Captura guardada en Imagenes/AsistenteEstudiantes."
                        : "Captura guardada internamente.");
            } catch (Exception error) {
                log("No se pudo guardar la captura.");
            }
        }, 900);
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
                out.close();
                return true;
            }
            File dir = new File(getExternalFilesDir(null), "AsistenteEstudiantes");
            if (!dir.exists()) dirs(dir);
            FileOutputStream out = new FileOutputStream(new File(dir, fileName));
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
            out.close();
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private void dirs(File dir) {
        if (!dir.exists()) dir.mkdirs();
    }

    private void setUiStatus(String status) {
        if (status.equals(lastUiStatus)) return;
        lastUiStatus = status;
        if (statusText != null) statusText.setText(status);
    }

    private void occasionalLog(String message) {
        long now = System.currentTimeMillis();
        if (now - lastLogAt < 1800) return;
        lastLogAt = now;
        log(message);
    }

    private void log(String message) {
        if (logText == null) return;
        logText.append(clock.format(new Date()) + "  " + message + "\n");
        if (logScroll != null) logScroll.post(() -> logScroll.fullScroll(View.FOCUS_DOWN));
    }

    private String readStream(InputStream input) throws Exception {
        if (input == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, "UTF-8"));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) builder.append(line);
        reader.close();
        return builder.toString();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (!stopped && !terminal) handler.post(this::runSecureTick);
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        reportExecutor.shutdown();
        super.onDestroy();
    }

    private String value(Uri uri, String key, String fallback) {
        String found = uri.getQueryParameter(key);
        return found == null ? fallback : found;
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

    private String originOf(String value) {
        try {
            Uri parsed = Uri.parse(value);
            return parsed.getScheme() + "://" + parsed.getAuthority();
        } catch (Exception error) {
            return value;
        }
    }
}
