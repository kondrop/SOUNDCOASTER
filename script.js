// script.js
// Wrap in an IIFE to avoid polluting global scope (optional but good practice)
(function() {
    console.log("Script start");

    // --- Global or Scope Variable ---
    let currentLoadCatalogExecutionId = 0; // Track the latest execution

    // --- Global Variables ---
    let player; // YouTube Player instance
    let isPlaying = false;
    let currentVideoId = null;
    let currentPlayerCardId = null;
    let playerReady = false;
    let soundBarInterval = null; // Interval ID for SVG animation
    let catalog = []; // Initialize catalog as an empty array
    let allTags = new Set(); // Store all unique tags from the catalog
    let selectedTag = null; // ← 変更: デフォルトは選択なし
    let isPausedByDiscInteraction = false; // ディスク操作による一時停止を追跡
    // const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR4CBc-Rmku_DocxYVsGLWgKXZ6qoYHqDOiiO9J94mTVeXxxcrCC_-gYYq02MwoWf7UPCdpWbxBIjCn/pub?gid=0&single=true&output=csv'; // Old CSV URL
    const SEEK_THROTTLE_MS = 50; // Throttle seek updates
    // const ROTATION_SENSITIVITY = 1.5; // How much rotation translates to seeking - Let's define a new one for visual rotation
    const VISUAL_ROTATION_SENSITIVITY = 0.8; // Sensitivity for visual rotation based on drag distance (degrees per pixel)
    const SEEK_SENSITIVITY = 8; // Degrees of rotation per second of video seek (Lowered from 60, might need further adjustment)
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby1xQlBqOgEkEV3f_pGsFid4CuiS7dBH-YJYYESIlMcoeG2h_buSPxlFXetfo2H-IE/exec'; // New Google Apps Script URL

    // 再生モード変数を追加
    const PLAYBACK_MODE = {
        SEQUENTIAL: 'sequential',
        RANDOM: 'random'
    };
    let playbackMode = PLAYBACK_MODE.SEQUENTIAL; // デフォルトは連続再生

    // Get DOM elements once - ensure they exist before accessing
    let catalogContainer = null;
    let tagFilterContainer = null; // Tag filter container
    let bottomPlayerContainer = null;
    let largeDiscContainer = null;
    let largeDisc = null; // To get center maybe
    let largeThumbnail = null;
    let currentTrackInfoDiv;
    let currentTrackTitleDiv;
    let currentTrackArtistDiv;
    let currentTrackGenreDiv;
    let globalErrorDiv;
    // Seek Bar elements
    let seekBarContainer = null;
    let seekBar = null;
    let currentTimeDisplay = null;
    let durationDisplay = null;
    let seekBarUpdateInterval = null;
    // Volume Slider elements (Custom)
    let volumeSliderContainer = null; // Container
    let volumeTrack = null;          // Track div
    let volumeThumb = null;          // Thumb div
    // 再生モード要素
    let playbackControlContainer = null;
    let sequentialPlaybackBtn = null;
    let randomPlaybackBtn = null;
    // カップマウスストーカー要素
    let cupCursor = null;
    let cupLiquidSim = null;
    // カスタムマウスカーソル要素
    let customCursor = null;
    let customCursorMoveHandlerAttached = false;
    let customCursorMoveHandlerRef = null;
    let cupResizeHandlerAttached = false;
    let cupResizeHandlerRef = null;

    // --- Scratch Interaction Variables ---
    let isDraggingDisc = false;
    // let startDragAngle = 0; // No longer needed for rotation calculation
    let currentDiscRotation = 0; // Store rotation applied by JS
    let initialDiscRotationOnDragStart = 0; // Store CSS rotation on drag start
    let lastSeekTime = 0; // For throttling seekTo
    let wasPlayingBeforeDrag = false;
    let throttleSeekTimer = null; // Timer for throttling
    let startDragX = 0; // ドラッグ開始X座標
    let startDragY = 0; // ドラッグ開始Y座標
    let prevDragX = 0; // 前回のドラッグX座標 (for delta calculation)
    let isConfirmedDrag = false; // ドラッグ操作が確定したかどうかのフラグ
    const DRAG_THRESHOLD = 5; // クリックとドラッグを区別するしきい値 (ピクセル)
    let dragStartTime = 0; // Added for tap detection

    // --- Hold Interaction Variables ---
    let holdTimer = null; // Timer for hold detection
    let isHoldingDisc = false; // Flag for hold state
    const HOLD_THRESHOLD_MS = 150; // Time in ms to detect hold

    // --- Custom Volume Slider Interaction Variables ---
    let isDraggingVolume = false;
    let currentVolumeValue = 50; // ※グローバル変数が定義されていなかったので追加

    // --- Click Spark Effect --- ★ NEW SECTION

    const sparkCanvas = document.getElementById('click-spark-canvas');
    let sparkCtx = null; // Initialize later
    const sparks = []; // Array to hold spark particles

    // Configuration (match React component props)
    const sparkConfig = {
        sparkColor: '#FF6B5B', // 火花の色 (例: ピンク/オレンジ)
        sparkSize: 5,        // 火花の線の初期サイズ
        sparkRadius: 15,       // 火花が移動する距離（半径）
        sparkCount: 10,        // 1クリックあたりの火花の数
        duration: 400,       // アニメーション時間 (ミリ秒)
        easing: 'ease-out', // イージング関数: 'linear', 'ease-in', 'ease-out', 'ease-in-out'
        extraScale: 1.0,     // オプションの拡大率
    };

    function easeFuncSpark(t) {
        switch (sparkConfig.easing) {
            case 'linear':
                return t;
            case 'ease-in':
                return t * t;
            case 'ease-in-out':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            case 'ease-out': // Default
            default:
                return t * (2 - t);
        }
    }

    function resizeSparkCanvas() {
        if (!sparkCanvas) return;
        // Use window dimensions for fixed position canvas
        sparkCanvas.width = window.innerWidth;
        sparkCanvas.height = window.innerHeight;
        // console.log(`Spark canvas resized to: ${sparkCanvas.width}x${sparkCanvas.height}`);
    }

    function drawSparkFrame(timestamp) {
        if (!sparkCtx || !sparkCanvas) {
            // console.warn("Spark context or canvas not ready for drawing.");
            requestAnimationFrame(drawSparkFrame); // Keep trying
            return;
         }
        sparkCtx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);

        const now = timestamp || performance.now(); // Use provided timestamp or get current time

        // Filter and draw sparks
        for (let i = sparks.length - 1; i >= 0; i--) {
            const spark = sparks[i];
            const elapsed = now - spark.startTime;

            if (elapsed >= sparkConfig.duration) {
                sparks.splice(i, 1); // Remove expired spark
                continue;
            }

            const progress = elapsed / sparkConfig.duration;
            const eased = easeFuncSpark(progress);

            const distance = eased * sparkConfig.sparkRadius * sparkConfig.extraScale;
            const lineLength = sparkConfig.sparkSize * (1 - eased); // Line shrinks as it moves out

            // Ensure lineLength is not negative
            const currentLineLength = Math.max(0, lineLength);

            // Calculate start and end points of the spark line
            const x1 = spark.x + distance * Math.cos(spark.angle);
            const y1 = spark.y + distance * Math.sin(spark.angle);
            const x2 = spark.x + (distance + currentLineLength) * Math.cos(spark.angle);
            const y2 = spark.y + (distance + currentLineLength) * Math.sin(spark.angle);

            sparkCtx.strokeStyle = sparkConfig.sparkColor;
            sparkCtx.lineWidth = 2; // Line width
            sparkCtx.beginPath();
            sparkCtx.moveTo(x1, y1);
            sparkCtx.lineTo(x2, y2);
            sparkCtx.stroke();
        }

        requestAnimationFrame(drawSparkFrame); // Continue the loop
    }

    function handlePageClickForSpark(event) {
        // Ignore clicks on volume slider or large disc to avoid visual clutter
        if (event.target.closest('#volume-slider-container') || event.target.closest('#large-disc-container')) {
            // console.log("Click ignored for spark (on volume/disc).");
            return;
        }

        if (!sparkCanvas || !sparkCtx) return; // Don't create sparks if canvas isn't ready

        const x = event.clientX; // Use clientX/Y for fixed canvas
        const y = event.clientY;
        const now = performance.now();

        for (let i = 0; i < sparkConfig.sparkCount; i++) {
            sparks.push({
                x,
                y,
                angle: (2 * Math.PI * i) / sparkConfig.sparkCount + (Math.random() - 0.5) * 0.5, // Add slight randomness
                startTime: now,
            });
        }
         // console.log(`Spark created at ${x},${y}. Total sparks: ${sparks.length}`);
    }

    function initializeClickSpark() {
        if (!sparkCanvas) {
            console.error("Click Spark Canvas element not found!");
            return;
        }
        sparkCtx = sparkCanvas.getContext('2d');
        if (!sparkCtx) {
             console.error("Failed to get 2D context for Click Spark Canvas!");
             return;
        }

        // Initial resize
        resizeSparkCanvas();

        // Resize listener
        let resizeTimeoutSpark;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeoutSpark);
            resizeTimeoutSpark = setTimeout(resizeSparkCanvas, 100);
        });

        // Click listener on the body
        document.body.addEventListener('click', handlePageClickForSpark);

        // Start animation loop
        requestAnimationFrame(drawSparkFrame);

        console.log("Click Spark Effect Initialized.");
    }

    // Function to get DOM elements safely after DOM is loaded
    function initializeDOMElements() {
        catalogContainer = document.getElementById('catalog-container');
        tagFilterContainer = document.getElementById('tag-filter-container'); // Get tag container
        bottomPlayerContainer = document.getElementById('bottom-player-container');
        largeDiscContainer = document.getElementById('large-disc-container');
        largeDisc = document.getElementById('large-disc');
        largeThumbnail = document.getElementById('large-thumbnail');
        currentTrackInfoDiv = document.getElementById('current-track-info');
        currentTrackTitleDiv = document.getElementById('current-track-title');
        currentTrackArtistDiv = document.getElementById('current-track-artist');
        currentTrackGenreDiv = document.getElementById('current-track-genre');
        globalErrorDiv = document.getElementById('global-error-message');
        // Get seek bar elements
        seekBarContainer = document.getElementById('seek-bar-container');
        seekBar = document.getElementById('seek-bar');
        currentTimeDisplay = document.getElementById('current-time-display');
        durationDisplay = document.getElementById('duration-display');
        // Get custom volume slider elements
        volumeSliderContainer = document.getElementById('volume-slider-container');
        volumeTrack = document.getElementById('volume-track');
        volumeThumb = document.getElementById('volume-thumb');
        // 再生モードコントロール要素を取得
        playbackControlContainer = document.getElementById('playback-control-container');
        sequentialPlaybackBtn = document.getElementById('sequential-playback-btn');
        randomPlaybackBtn = document.getElementById('random-playback-btn');
        // カップマウスストーカー要素を取得
        cupCursor = document.getElementById('cup-cursor');
        // カスタムマウスカーソル要素を取得
        customCursor = document.getElementById('custom-cursor');

        // Check all necessary elements
        if (!catalogContainer || !tagFilterContainer || !bottomPlayerContainer || !largeDiscContainer || !largeThumbnail || !largeDisc || !currentTrackInfoDiv || !currentTrackTitleDiv || !currentTrackArtistDiv || !currentTrackGenreDiv || !globalErrorDiv || !seekBarContainer || !seekBar || !currentTimeDisplay || !durationDisplay || !volumeSliderContainer || !volumeTrack || !volumeThumb || !playbackControlContainer || !sequentialPlaybackBtn || !randomPlaybackBtn) { // ★ Check custom volume elements
            console.error("One or more essential DOM elements are missing!");
            displayGlobalError("ページ要素の読み込みに失敗しました。");
        } else {
            addScratchListeners();
            addSeekBarListeners(); // Add listeners for the seek bar
            addPlaybackModeListeners(); // 再生モードリスナーを追加
            initializeCupCursor(); // カップマウスストーカーの初期化
            cupLiquidSim = initializeCupLiquid();
            initializeCustomCursor(); // カスタムマウスカーソルの初期化
            // Custom volume listener setup is done in onPlayerReady
        }
    }

    // Call initialization when the DOM is ready
    document.addEventListener('DOMContentLoaded', initializeDOMElements);

    function initializeCupLiquid() {
        if (!cupCursor) {
            return null;
        }
        const canvas = cupCursor.querySelector('#cup-liquid');
        if (!canvas) {
            console.warn('Cup liquid canvas element not found.');
            return null;
        }
        const sim = createCupLiquidSimulation(canvas);
        if (!sim) {
            console.warn('Failed to initialise cup liquid simulation.');
        }
        return sim;
    }

    function createCupLiquidSimulation(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('2D context for cup liquid canvas is unavailable.');
            return null;
        }

        const coffee = [161, 109, 58]; // A16D3A のRGB値に変更
        const milk = [237, 214, 182];   // EDD6B6: 指定のミルク色に変更
        const crema = [181, 139, 85];   // 濃いめのクレマ色

        const params = {
            damping: 0.93,
            waveSpeed: 0.51,
        };

        let width = 0;
        let height = 0;
        let prev = null;
        let curr = null;
        let next = null;
        let imageData = null;
        let animationId = null;
        let resizePending = false;
        let lastPointer = null;
        let lastScreenPointer = null;
        let dropRadius = 85;
        let baseStrength = 1.0;
        let idleCounter = 0;

        function updateDerivedParams() {
            dropRadius = Math.max(3, Math.round(width * 0.12));
            baseStrength = 1.2 + width * 0.012;
        }

        function allocate() {
            const ratio = window.devicePixelRatio || 1;
            const displayWidth = Math.max(2, Math.floor(canvas.clientWidth * ratio));
            const displayHeight = Math.max(2, Math.floor(canvas.clientHeight * ratio));
            if (displayWidth === width && displayHeight === height) {
                return;
            }
            width = displayWidth;
            height = displayHeight;
            canvas.width = width;
            canvas.height = height;
            prev = new Float32Array(width * height);
            curr = new Float32Array(width * height);
            next = new Float32Array(width * height);
            imageData = ctx.createImageData(width, height);
            updateDerivedParams();
        }

        function scheduleResize() {
            if (resizePending) return;
            resizePending = true;
            requestAnimationFrame(() => {
                resizePending = false;
                allocate();
            });
        }

        let resizeObserver = null;
        let resizeListener = null;
        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver(scheduleResize);
            resizeObserver.observe(canvas);
        } else {
            resizeListener = scheduleResize;
            window.addEventListener('resize', resizeListener, { passive: true });
        }

        function addDrop(x, y, strength) {
            if (!curr) return;
            const radius = dropRadius;
            const minX = Math.max(1, Math.floor(x - radius));
            const maxX = Math.min(width - 2, Math.ceil(x + radius));
            const minY = Math.max(1, Math.floor(y - radius));
            const maxY = Math.min(height - 2, Math.ceil(y + radius));
            for (let yy = minY; yy <= maxY; yy++) {
                const rowIndex = yy * width;
                for (let xx = minX; xx <= maxX; xx++) {
                    const dx = xx - x;
                    const dy = yy - y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < radius) {
                        const falloff = Math.cos((dist / radius) * Math.PI) * 0.5 + 0.5;
                        curr[rowIndex + xx] += strength * falloff;
                    }
                }
            }
        }

        function updateField() {
            if (!curr || !prev || !next) return;
            for (let y = 1; y < height - 1; y++) {
                const rowIndex = y * width;
                for (let x = 1; x < width - 1; x++) {
                    const i = rowIndex + x;
                    const sum = curr[i - 1] + curr[i + 1] + curr[i - width] + curr[i + width];
                    next[i] = (sum * params.waveSpeed - prev[i]) * params.damping;
                }
            }
            const tmp = prev;
            prev = curr;
            curr = next;
            next = tmp;
            next.fill(0);

            if (!lastPointer) {
                idleCounter++;
                if (idleCounter > 220) {
                    idleCounter = 0;
                    addDrop(
                        width * (0.35 + Math.random() * 0.3),
                        height * (0.32 + Math.random() * 0.1),
                        baseStrength * 0.35
                    );
                }
            } else {
                idleCounter = 0;
            }
        }

        function renderField() {
            if (!imageData || !curr) return;
            const data = imageData.data;
            const total = width * height;
            for (let i = 0; i < total; i++) {
                const v = Math.max(-1, Math.min(1, curr[i]));
                const blend = (v + 1) * 0.5;
                let r, g, b;
                if (blend < 0.5) {
                    const t = blend / 0.5;
                    r = milk[0] * (1 - t) + crema[0] * t;
                    g = milk[1] * (1 - t) + crema[1] * t;
                    b = milk[2] * (1 - t) + crema[2] * t;
                } else {
                    const t = (blend - 0.5) / 0.5;
                    r = crema[0] * (1 - t) + coffee[0] * t;
                    g = crema[1] * (1 - t) + coffee[1] * t;
                    b = crema[2] * (1 - t) + coffee[2] * t;
                }
                const idx = i * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
            ctx.putImageData(imageData, 0, 0);
        }

        function handlePointer(globalX, globalY) {
            if (typeof globalX !== 'number' || typeof globalY !== 'number') {
                lastPointer = null;
                lastScreenPointer = null;
                return;
            }
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                lastPointer = null;
                lastScreenPointer = null;
                return;
            }
            const localX = ((globalX - rect.left) / rect.width) * width;
            const localY = ((globalY - rect.top) / rect.height) * height;
            const margin = Math.max(12, width * 0.6);
            if (localX < -margin || localX > width + margin || localY < -margin || localY > height + margin) {
                lastPointer = null;
                lastScreenPointer = { x: globalX, y: globalY };
                return;
            }

            const clampedX = Math.min(width - 2, Math.max(1, localX));
            const clampedY = Math.min(height - 2, Math.max(1, localY));

            const travel = lastScreenPointer
                ? Math.min(1.8, Math.hypot(globalX - lastScreenPointer.x, globalY - lastScreenPointer.y) / 28)
                : 0.6;
            const strength = baseStrength * (0.5 + travel);

            if (lastPointer) {
                const dx = clampedX - lastPointer.x;
                const dy = clampedY - lastPointer.y;
                const steps = Math.max(Math.abs(dx), Math.abs(dy));
                if (steps === 0) {
                    addDrop(clampedX, clampedY, strength);
                } else {
                    for (let s = 0; s <= steps; s++) {
                        const px = lastPointer.x + (dx * s) / steps;
                        const py = lastPointer.y + (dy * s) / steps;
                        addDrop(px, py, strength * 0.85);
                    }
                }
            } else {
                addDrop(clampedX, clampedY, strength);
            }

            lastPointer = { x: clampedX, y: clampedY };
            lastScreenPointer = { x: globalX, y: globalY };
        }

        function releasePointer() {
            lastPointer = null;
            lastScreenPointer = null;
        }

        function step() {
            if (width === 0 || height === 0) {
                allocate();
            }
            updateField();
            renderField();
            animationId = requestAnimationFrame(step);
        }

        allocate();
        step();

        return {
            handlePointer,
            releasePointer,
            dispose() {
                if (animationId !== null) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                }
                releasePointer();
                if (resizeObserver) {
                    resizeObserver.disconnect();
                    resizeObserver = null;
                }
                if (resizeListener) {
                    window.removeEventListener('resize', resizeListener);
                    resizeListener = null;
                }
            },
        };
    }

    // --- カップマウスストーカー機能 ---
    document.addEventListener('mouseleave', () => {
        if (cupLiquidSim && typeof cupLiquidSim.releasePointer === 'function') {
            cupLiquidSim.releasePointer();
        }
    });
    let isMovingToCard = false; // グローバルフラグ
    let cupPlacedOnCard = false; // カップがカード上に配置されているか
    let placedCardElement = null; // カップが配置されているカード要素
    // 再生中や配置後にマウス追従を完全停止させるロック
    let cupLockedToCard = false;
    let isLoadingNewTrack = false; // 新しいトラックの読み込み中フラグ（チラつき防止用）
    // カップの配置位置オフセット（カード内での位置調整用）
    const CUP_POSITION_OFFSET = {
        left: '53%',   // 左位置（デフォルト: 中央）
        top: '25%',    // 上位置（少し上に上げました）
        translateX: '-50%', // X方向の変換（デフォルト: 中央揃え）
        translateY: '-50%'   // Y方向の変換（デフォルト: 中央揃え）
    };
    let scrollListener = null; // スクロールリスナー
    let resizeListener = null; // リサイズリスナー
    let cupX = 0; // カップのX座標（グローバル）
    let cupY = 0; // カップのY座標（グローバル）
    let cupAnimationFrameId = null; // アニメーションフレームID（停止用）
    // mousemove リスナーの参照（detach/attach 用に保持）
    let onDocMouseMoveRef = null;
    // fixed positionでカードに固定する際の監視用
    let cupPositionUpdateInterval = null; // カップ位置更新用のinterval
    // カップの傾き用の変数
    let previousMouseX = 0; // 前回のマウスX座標
    let cupRotation = 0; // カップの現在の傾き角度（度）
    let targetRotation = 0; // 目標の傾き角度

let cupMouseMoveAttached = false;

// カードが absolutely-positioned な子要素を受け入れられるように（保険）
function ensureCardPositioning(cardEl) {
    const cs = window.getComputedStyle(cardEl);
    if (cs.position === 'static' || !cs.position) {
        cardEl.style.position = 'relative';
    }
}

function clampCupPosition(x, y) {
    if (!catalogContainer) {
        return { x, y };
    }

    const rect = catalogContainer.getBoundingClientRect();
    const cupWidth = cupCursor ? cupCursor.offsetWidth : 100;
    const cupHeight = cupCursor ? cupCursor.offsetHeight : 100;
    const halfWidth = cupWidth / 2;
    const halfHeight = cupHeight / 2;

    let minX = rect.left + halfWidth;
    let maxX = rect.right - halfWidth;
    let minY = rect.top + halfHeight;
    let maxY = rect.bottom - halfHeight;

    if (minX > maxX) {
        const centerX = rect.left + rect.width / 2;
        minX = maxX = centerX;
    }
    if (minY > maxY) {
        const centerY = rect.top + rect.height / 2;
        minY = maxY = centerY;
    }

    const clampedX = Math.min(maxX, Math.max(minX, x));
    const clampedY = Math.min(maxY, Math.max(minY, y));

    return { x: clampedX, y: clampedY };
}

    // --- mousemove ハンドラ（グローバル定義：removeEventListener可能にする） ---
    function onDocMouseMove(e) {
        const rawMouseX = e.clientX;
        const rawMouseY = e.clientY;
        const { x: targetMouseX, y: targetMouseY } = clampCupPosition(rawMouseX, rawMouseY);
        window.mouseX = targetMouseX;
        window.mouseY = targetMouseY;
        if (cupLiquidSim && typeof cupLiquidSim.handlePointer === 'function') {
            cupLiquidSim.handlePointer(rawMouseX, rawMouseY);
        }

        // ロック中/移動中/再生中に配置済みなら追従を停止
        if (cupLockedToCard || isMovingToCard || (isPlaying && cupPlacedOnCard)) {
            if (cupAnimationFrameId !== null) {
                cancelAnimationFrame(cupAnimationFrameId);
                cupAnimationFrameId = null;
            }
            return;
        }

        // マウスの横方向の動きを検出して傾き角度を計算
        const deltaX = targetMouseX - previousMouseX;
        // 画面幅に対する移動量の割合に基づいて傾きを計算（最大45度まで）
        const maxRotation = 45; // 最大傾き角度
        const sensitivity = 1.2; // 感度調整（横方向の動きに対する傾きの強さ）
        targetRotation = Math.max(-maxRotation, Math.min(maxRotation, deltaX * sensitivity));
        previousMouseX = targetMouseX;

        function updateCupPosition() {
            if (cupLockedToCard || isMovingToCard || (isPlaying && cupPlacedOnCard)) {
                cupAnimationFrameId = null;
                return;
            }
            cupX += (targetMouseX - cupX) * 0.2;
            cupY += (targetMouseY - cupY) * 0.2;
            
            // 傾き角度をスムーズに更新
            cupRotation += (targetRotation - cupRotation) * 0.15;
            
            if (cupCursor) {
                cupCursor.style.left = cupX + 'px';
                cupCursor.style.top = cupY + 'px';
                // transformにtranslateとrotateを組み合わせる
                cupCursor.style.transform = `translate(-50%, -50%) rotate(${cupRotation}deg)`;
            }
            
            // 目標角度に近づいたら傾きを徐々に戻す
            if (Math.abs(targetRotation) > 0.1) {
                targetRotation *= 0.95; // 徐々に0に近づける
            } else {
                targetRotation = 0;
            }
            
            if (Math.abs(targetMouseX - cupX) > 0.1 || Math.abs(targetMouseY - cupY) > 0.1 || Math.abs(cupRotation) > 0.1) {
                cupAnimationFrameId = requestAnimationFrame(updateCupPosition);
            } else {
                cupAnimationFrameId = null;
            }
        }

        if (cupAnimationFrameId !== null) {
            cancelAnimationFrame(cupAnimationFrameId);
        }
        cupAnimationFrameId = requestAnimationFrame(updateCupPosition);
    }

    function attachCupMouseMove() {
        if (cupMouseMoveAttached) return;
        onDocMouseMoveRef = onDocMouseMove;
        document.addEventListener('mousemove', onDocMouseMoveRef);
        cupMouseMoveAttached = true;
    }

    function detachCupMouseMove() {
        if (!cupMouseMoveAttached) return;
        if (onDocMouseMoveRef) {
            document.removeEventListener('mousemove', onDocMouseMoveRef);
            onDocMouseMoveRef = null;
        }
        cupMouseMoveAttached = false;
        if (cupAnimationFrameId !== null) {
            cancelAnimationFrame(cupAnimationFrameId);
            cupAnimationFrameId = null;
        }
    }

    function initializeCupCursor() {
        if (!cupCursor) {
            console.warn("Cup cursor element not found.");
            return;
        }

        // 初期位置を設定
        cupCursor.style.display = 'block';
        cupCursor.style.position = 'fixed';
        cupCursor.style.transform = 'translate(-50%, -50%) rotate(0deg)';
        cupX = window.innerWidth / 2;
        cupY = window.innerHeight / 2;
        const { x: initialClampedX, y: initialClampedY } = clampCupPosition(cupX, cupY);
        cupX = initialClampedX;
        cupY = initialClampedY;
        cupCursor.style.left = cupX + 'px';
        cupCursor.style.top = cupY + 'px';
        window.mouseX = cupX;
        window.mouseY = cupY;
        previousMouseX = cupX; // 初期化時に前回のマウスX座標を設定
        cupRotation = 0; // 初期傾き角度を0に
        targetRotation = 0; // 目標角度も0に

        if (!cupResizeHandlerAttached) {
            cupResizeHandlerRef = () => {
                if (!cupCursor || cupLockedToCard || cupPlacedOnCard || isMovingToCard) {
                    return;
                }
                const { x: clampedX, y: clampedY } = clampCupPosition(cupX, cupY);
                cupX = clampedX;
                cupY = clampedY;
                cupCursor.style.left = cupX + 'px';
                cupCursor.style.top = cupY + 'px';
                window.mouseX = cupX;
                window.mouseY = cupY;
            };
            window.addEventListener('resize', cupResizeHandlerRef, { passive: true });
            cupResizeHandlerAttached = true;
        }

        // 初期は追従を有効化
        attachCupMouseMove();

        console.log("Cup cursor initialized.");
    }

    function initializeCustomCursor() {
        if (!customCursor) {
            console.warn("Custom cursor element not found.");
            return;
        }

        // 初期位置を設定（画面中央）
        const initialX = window.innerWidth / 2;
        const initialY = window.innerHeight / 2;
        const { x: initialCustomClampedX, y: initialCustomClampedY } = clampCupPosition(initialX, initialY);
        customCursor.style.left = initialX + 'px';
        customCursor.style.top = initialY + 'px';
        customCursor.style.display = 'block';
        window.mouseX = initialCustomClampedX;
        window.mouseY = initialCustomClampedY;

        if (!customCursorMoveHandlerAttached) {
            customCursorMoveHandlerRef = (event) => {
                const x = event.clientX;
                const y = event.clientY;
                const { x: clampedX, y: clampedY } = clampCupPosition(x, y);
                window.mouseX = clampedX;
                window.mouseY = clampedY;
                customCursor.style.left = x + 'px';
                customCursor.style.top = y + 'px';
            };
            document.addEventListener('mousemove', customCursorMoveHandlerRef, { passive: true });
            customCursorMoveHandlerAttached = true;
        }

        // ホバー可能な要素を検出してカーソルを大きくする
        const hoverableSelectors = [
            'button',
            'a',
            '.player-card',
            '.tag-button',
            '#seek-bar',
            '#volume-slider-container',
            '.playback-control-button',
            'input[type="range"]'
        ];

        // ホバー可能な要素を検出する関数
        function isHoverableElement(element) {
            if (!element) return false;
            return hoverableSelectors.some(selector => {
                return element.matches(selector) || element.closest(selector);
            });
        }

        // ホバー可能な要素にマウスオーバー/アウトイベントを追加
        document.addEventListener('mouseover', (e) => {
            const target = e.target;
            if (isHoverableElement(target) && customCursor) {
                customCursor.classList.add('hover');
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target;
            const relatedTarget = e.relatedTarget;
            
            // ホバー可能な要素から出た時、かつ移動先がホバー可能でない場合のみクラスを削除
            if (isHoverableElement(target) && !isHoverableElement(relatedTarget) && customCursor) {
                customCursor.classList.remove('hover');
            }
        });

        console.log("Custom cursor initialized.");
    }

    function moveCupToCard(cardElement, callback) {
        if (!cupCursor || !cardElement) {
            if (callback) callback();
            return;
        }

        // 既存のアニメーションフレームをキャンセル
        if (cupAnimationFrameId !== null) {
            cancelAnimationFrame(cupAnimationFrameId);
            cupAnimationFrameId = null;
        }

        isMovingToCard = true; // フラグを設定
        isLoadingNewTrack = true; // 新しいトラックの読み込み開始

        const cardRect = cardElement.getBoundingClientRect();
        const cardStyle = window.getComputedStyle(cardElement);
        
        // padding-box基準のサイズを計算（absoluteポジションの%はpadding-box基準）
        const paddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(cardStyle.paddingTop) || 0;
        const paddingRight = parseFloat(cardStyle.paddingRight) || 0;
        const paddingBottom = parseFloat(cardStyle.paddingBottom) || 0;
        const borderLeft = parseFloat(cardStyle.borderLeftWidth) || 0;
        const borderTop = parseFloat(cardStyle.borderTopWidth) || 0;
        
        // padding-box基準のサイズ（getBoundingClientRectはborder-box基準）
        const paddingBoxWidth = cardRect.width - borderLeft - parseFloat(cardStyle.borderRightWidth || 0) - paddingLeft - paddingRight;
        const paddingBoxHeight = cardRect.height - borderTop - parseFloat(cardStyle.borderBottomWidth || 0) - paddingTop - paddingBottom;
        
        // padding-box基準の左上座標（画面座標）
        const paddingBoxLeft = cardRect.left + borderLeft + paddingLeft;
        const paddingBoxTop = cardRect.top + borderTop + paddingTop;
        
        // CUP_POSITION_OFFSETを考慮して最終的な配置位置を計算
        // パーセンテージをピクセル値に変換
        const leftPercent = parseFloat(CUP_POSITION_OFFSET.left) / 100;
        const topPercent = parseFloat(CUP_POSITION_OFFSET.top) / 100;
        
        // padding-box基準での位置を計算
        // 固定後のCSSでは left: 53% がカップの中心点になる（translate(-50%, -50%)が適用されるため）
        // したがって、移動時も同じ位置（padding-box幅 × 53%）に移動すれば一致する
        const targetCenterXInPaddingBox = paddingBoxWidth * leftPercent;
        const targetCenterYInPaddingBox = paddingBoxHeight * topPercent;
        
        // 画面座標に変換（padding-box基準の左上 + カード内での中心点位置）
        // fixed positionでtranslate(-50%, -50%)が適用されるため、中心点を指定
        const targetScreenX = paddingBoxLeft + targetCenterXInPaddingBox;
        const targetScreenY = paddingBoxTop + targetCenterYInPaddingBox;
        
        // デバッグログ
        console.log('=== moveCupToCard 位置計算 ===');
        console.log('cardRect:', { width: cardRect.width, height: cardRect.height, left: cardRect.left, top: cardRect.top });
        console.log('padding-box:', { width: paddingBoxWidth, height: paddingBoxHeight, left: paddingBoxLeft, top: paddingBoxTop });
        console.log('CUP_POSITION_OFFSET:', CUP_POSITION_OFFSET);
        console.log('targetCenter (padding-box):', { x: targetCenterXInPaddingBox, y: targetCenterYInPaddingBox });
        console.log('targetScreen:', { x: targetScreenX, y: targetScreenY });

        // マウス追従を停止（アニメーション中は追従しない）
        cupLockedToCard = true;

        // 現在の位置を取得
        const currentRect = cupCursor.getBoundingClientRect();
        const currentCenterX = currentRect.left + currentRect.width / 2;
        const currentCenterY = currentRect.top + currentRect.height / 2;
        
        // 傾きをリセット
        cupRotation = 0;
        targetRotation = 0;
        
        // GSAPでfixed positionから目標位置まで移動
        gsap.to(cupCursor, {
            left: targetScreenX + 'px',
            top: targetScreenY + 'px',
            rotation: 0, // 傾きも0に戻す
            duration: 0.5,
            ease: 'power2.out',
            onComplete: () => {
                cupCursor.classList.add('placed');
                cupPlacedOnCard = true; // カップがカード上に配置されたことを記録
                placedCardElement = cardElement; // カード要素を保存
                cupLockedToCard = true; // マウス追従を完全停止
                
                // 追従イベントを完全解除
                detachCupMouseMove();
                
                // 移動中フラグを解除
                isMovingToCard = false;
                
                // fixed positionのまま、カードの位置変更を監視して位置を更新
                startCupPositionTracking(cardElement);
                
                // 再生が開始されたらコールバックを実行
                if (callback) callback();
            }
        });
        
        // グローバル変数も更新
        cupX = targetScreenX;
        cupY = targetScreenY;
    }

    // カップをアニメなしでカードの中心へ即座に配置（fixed position方式）
    function moveCupInstantToCard(cardElement) {
        if (!cupCursor || !cardElement) return;

        // カードの位置を取得してカップの位置を計算
        const cardRect = cardElement.getBoundingClientRect();
        const cardStyle = window.getComputedStyle(cardElement);
        const paddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(cardStyle.paddingTop) || 0;
        const borderLeft = parseFloat(cardStyle.borderLeftWidth) || 0;
        const borderTop = parseFloat(cardStyle.borderTopWidth) || 0;
        
        // padding-box基準のサイズと位置を計算
        const paddingBoxWidth = cardRect.width - borderLeft - parseFloat(cardStyle.borderRightWidth || 0) - paddingLeft - parseFloat(cardStyle.paddingRight || 0);
        const paddingBoxHeight = cardRect.height - borderTop - parseFloat(cardStyle.borderBottomWidth || 0) - paddingTop - parseFloat(cardStyle.paddingBottom || 0);
        const paddingBoxLeft = cardRect.left + borderLeft + paddingLeft;
        const paddingBoxTop = cardRect.top + borderTop + paddingTop;
        
        // カップの中心位置を計算
        const leftPercent = parseFloat(CUP_POSITION_OFFSET.left) / 100;
        const topPercent = parseFloat(CUP_POSITION_OFFSET.top) / 100;
        const targetCenterXInPaddingBox = paddingBoxWidth * leftPercent;
        const targetCenterYInPaddingBox = paddingBoxHeight * topPercent;
        const targetScreenX = paddingBoxLeft + targetCenterXInPaddingBox;
        const targetScreenY = paddingBoxTop + targetCenterYInPaddingBox;

        // 傾きをリセット
        cupRotation = 0;
        targetRotation = 0;
        
        // fixed positionで即座に配置
        cupCursor.style.position = 'fixed';
        cupCursor.style.left = targetScreenX + 'px';
        cupCursor.style.top = targetScreenY + 'px';
        cupCursor.style.transform = 'translate(-50%, -50%) rotate(0deg)';

        cupCursor.classList.add('placed');
        cupPlacedOnCard = true;
        placedCardElement = cardElement;
        cupLockedToCard = true;

        // マウス追従を完全停止
        detachCupMouseMove();
        
        // fixed positionのまま、カードの位置変更を監視して位置を更新
        startCupPositionTracking(cardElement);
    }

    // fixed positionのまま、カードの位置変更を監視してカップの位置を更新
    function startCupPositionTracking(cardElement) {
        // 既存の監視を停止
        stopCupPositionTracking();
        
        // カード内での相対位置（padding-box基準）を保存
        const leftPercent = parseFloat(CUP_POSITION_OFFSET.left) / 100;
        const topPercent = parseFloat(CUP_POSITION_OFFSET.top) / 100;
        
        // 前回の位置を保存（変更があった時だけ更新）
        let lastCardLeft = 0;
        let lastCardTop = 0;
        let lastCardWidth = 0;
        let lastCardHeight = 0;
        
        // カップの位置を更新する関数
        const updatePosition = () => {
            if (!cupCursor || !cardElement || !cupPlacedOnCard) {
                stopCupPositionTracking();
                return;
            }

            if (!document.body.contains(cardElement)) {
                resetCupFromCard();
                return;
            }

            const cardRect = cardElement.getBoundingClientRect();

            if (Math.abs(cardRect.left - lastCardLeft) > 0.1 ||
                Math.abs(cardRect.top - lastCardTop) > 0.1 ||
                Math.abs(cardRect.width - lastCardWidth) > 0.1 ||
                Math.abs(cardRect.height - lastCardHeight) > 0.1) {

                const updated = updateCupPositionRelativeToCard(cardElement, {
                    cardRect,
                    leftPercent,
                    topPercent
                });

                if (!updated) {
                    resetCupFromCard();
                    return;
                }

                lastCardLeft = cardRect.left;
                lastCardTop = cardRect.top;
                lastCardWidth = cardRect.width;
                lastCardHeight = cardRect.height;
            }
        };
        
        // 初回実行
        updatePosition();
        
        // スクロールとリサイズイベントで更新（throttleでパフォーマンス最適化）
        let scrollTimeout = null;
        let resizeTimeout = null;
        
        const handleScroll = () => {
            if (cupPlacedOnCard && placedCardElement === cardElement) {
                if (scrollTimeout) return; // 既にスケジュール済みならスキップ
                scrollTimeout = requestAnimationFrame(() => {
                    updatePosition();
                    scrollTimeout = null;
                });
            }
        };
        
        const handleResize = () => {
            if (cupPlacedOnCard && placedCardElement === cardElement) {
                if (resizeTimeout) return; // 既にスケジュール済みならスキップ
                resizeTimeout = requestAnimationFrame(() => {
                    updatePosition();
                    resizeTimeout = null;
                });
            }
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);
        
        scrollListener = handleScroll;
        resizeListener = handleResize;
    }

    function updateCupPositionRelativeToCard(cardElement, options = {}) {
        if (!cupCursor || !cardElement) return false;

        const cardRect = options.cardRect || cardElement.getBoundingClientRect();
        if (!cardRect || (cardRect.width === 0 && cardRect.height === 0)) {
            return false;
        }

        const cardStyle = options.cardStyle || window.getComputedStyle(cardElement);
        const paddingLeft = parseFloat(cardStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(cardStyle.paddingTop) || 0;
        const paddingRight = parseFloat(cardStyle.paddingRight) || 0;
        const paddingBottom = parseFloat(cardStyle.paddingBottom) || 0;
        const borderLeft = parseFloat(cardStyle.borderLeftWidth) || 0;
        const borderTop = parseFloat(cardStyle.borderTopWidth) || 0;
        const borderRight = parseFloat(cardStyle.borderRightWidth) || 0;
        const borderBottom = parseFloat(cardStyle.borderBottomWidth) || 0;

        const paddingBoxWidth = cardRect.width - borderLeft - borderRight - paddingLeft - paddingRight;
        const paddingBoxHeight = cardRect.height - borderTop - borderBottom - paddingTop - paddingBottom;

        if (paddingBoxWidth <= 0 || paddingBoxHeight <= 0) {
            return false;
        }

        const paddingBoxLeft = cardRect.left + borderLeft + paddingLeft;
        const paddingBoxTop = cardRect.top + borderTop + paddingTop;

        const leftPercent = typeof options.leftPercent === 'number'
            ? options.leftPercent
            : parseFloat(CUP_POSITION_OFFSET.left) / 100;
        const topPercent = typeof options.topPercent === 'number'
            ? options.topPercent
            : parseFloat(CUP_POSITION_OFFSET.top) / 100;

        const targetCenterXInPaddingBox = paddingBoxWidth * leftPercent;
        const targetCenterYInPaddingBox = paddingBoxHeight * topPercent;

        const targetScreenX = paddingBoxLeft + targetCenterXInPaddingBox;
        const targetScreenY = paddingBoxTop + targetCenterYInPaddingBox;

        if (!Number.isFinite(targetScreenX) || !Number.isFinite(targetScreenY)) {
            return false;
        }

        cupCursor.style.position = 'fixed';
        cupCursor.style.left = `${targetScreenX}px`;
        cupCursor.style.top = `${targetScreenY}px`;
        cupCursor.style.transform = 'translate(-50%, -50%) rotate(0deg)';

        cupX = targetScreenX;
        cupY = targetScreenY;

        return true;
    }

    function syncCupWithPlacedCard() {
        if (!cupCursor || !cupPlacedOnCard || !placedCardElement) return;

        if (!document.body.contains(placedCardElement)) {
            resetCupFromCard();
            return;
        }

        const updated = updateCupPositionRelativeToCard(placedCardElement);
        if (!updated) {
            resetCupFromCard();
        }
    }
    
    // カップ位置の監視を停止
    function stopCupPositionTracking() {
        if (cupPositionUpdateInterval !== null) {
            cancelAnimationFrame(cupPositionUpdateInterval);
            cupPositionUpdateInterval = null;
        }
        if (scrollListener) {
            window.removeEventListener('scroll', scrollListener);
            scrollListener = null;
        }
        if (resizeListener) {
            window.removeEventListener('resize', resizeListener);
            resizeListener = null;
        }
    }
    
    // カードの位置に合わせてカップの位置を更新（スクロール時など）
    // ※ reparent 方式により未使用（安全のため残置）。呼ばれても即 return。
    function updateCupPositionOnCard() {
        // ※ reparent 方式により未使用（安全のため残置）。呼ばれても即 return。
        return;
    }

    // カップをカードから離し、body に戻してフォロワーに復帰
    function resetCupFromCard() {
        if (!cupCursor) return;

        // カップ位置の監視を停止
        stopCupPositionTracking();

        // 状態クリア
        cupPlacedOnCard = false;
        placedCardElement = null;
        cupCursor.classList.remove('moving-to-card', 'placed');
        cupLockedToCard = false; // ロック解除（再びマウスに追従）

        // 傾きをリセット
        cupRotation = 0;
        targetRotation = 0;
        previousMouseX = window.mouseX || window.innerWidth / 2; // 現在のマウス位置を設定

        // グローバル層（body）へ戻す（既にbodyにある場合は不要）
        if (cupCursor.parentElement !== document.body) {
            document.body.appendChild(cupCursor);
        }
        cupCursor.style.position = 'fixed';
        cupCursor.style.left = (window.mouseX || window.innerWidth / 2) + 'px';
        cupCursor.style.top  = (window.mouseY || window.innerHeight / 2) + 'px';
        cupCursor.style.transform = 'translate(-50%, -50%) rotate(0deg)';

        // マウス追従を再開
        attachCupMouseMove();
    }

    // --- Scratch Interaction Functions ---

    // getAngle is no longer needed for basic drag rotation, but keep it for potential future use or if seek logic needs it indirectly.
    function getAngle(cx, cy, ex, ey) {
        const dy = ey - cy;
        const dx = ex - cx;
        let theta = Math.atan2(dy, dx); // range (-PI, PI]
        theta *= 180 / Math.PI; // rads to degs, range (-180, 180]
        // if (theta < 0) theta = 360 + theta; // uncomment to range [0, 360)
        return theta;
    }

    /* function getRotationDegrees(element) { ... } */

    function handleDiscDragStart(event) {
        console.log("Interaction start event triggered on:", event.target);
        if (!largeDiscContainer || !playerReady || !player) {
             console.log("Interaction start aborted: Player not ready or container missing.");
             return;
        }
        // Prevent default actions only if target is the disc or its child
        if (largeDiscContainer.contains(event.target)) {
            event.preventDefault(); // Prevent image dragging, text selection, etc.
        } else {
            console.log("Interaction start aborted: Target is not the disc container or its child.");
            return;
        }

        // ドラッグ開始時に再生情報を表示したままにする
        const currentTrackInfo = document.getElementById('current-track-info');
        if (currentTrackInfo && currentVideoId) {
            currentTrackInfo.classList.add('visible');
        }

        dragStartTime = Date.now(); // Record the start time for duration calculation
        isDraggingDisc = true; // Use this to indicate an active interaction (drag OR potential hold)
        isConfirmedDrag = false;
        isHoldingDisc = false; // Reset hold state at the beginning
        wasPlayingBeforeDrag = isPlaying; // Store current playing state

        // Clear any previous hold timer just in case
        clearTimeout(holdTimer);

        // --- Start Hold Timer ---
        holdTimer = setTimeout(() => {
            // This runs ONLY if the mouse/touch is held down for HOLD_THRESHOLD_MS
            // AND drag hasn't been confirmed yet.
            if (isDraggingDisc && !isConfirmedDrag) {
                console.log("Hold detected.");
                isHoldingDisc = true; // Set hold state

                // Pause video and stop animation immediately upon hold detection
                if (wasPlayingBeforeDrag && player && typeof player.pauseVideo === 'function') {
                    player.pauseVideo();
                    console.log("Hold: Paused video.");
                } else if (!wasPlayingBeforeDrag){
                    console.log("Hold: Video was already paused.");
                } else {
                    console.warn("Hold: Could not pause video.");
                }

                if (largeDiscContainer) {
                    largeDiscContainer.classList.remove('playing'); // Stop CSS animation
                    // Optional: Change cursor to indicate hold state
                    // largeDiscContainer.style.cursor = 'wait';
                }
            }
        }, HOLD_THRESHOLD_MS);
        // -----------------------

        // Get initial position
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        startDragX = clientX; // Store starting X coordinate for threshold check
        startDragY = clientY; // Store starting Y coordinate for threshold check
        prevDragX = clientX; // Initialize previous X for delta calculation

        // Use the JS tracked angle 'currentDiscRotation'. Store its initial value.
        initialDiscRotationOnDragStart = currentDiscRotation;

        console.log("Interaction Start: Initial Rotation:", initialDiscRotationOnDragStart.toFixed(1));
        largeDiscContainer.style.cursor = 'grabbing'; // Indicate potential drag
        largeDiscContainer.style.userSelect = 'none'; // Prevent selection on the element
        document.body.style.userSelect = 'none'; // Prevent text selection during interaction
    }

    function handleDiscDragMove(event) {
        // Add a log at the very beginning
        // console.log("handleDiscDragMove triggered");

        if (!isDraggingDisc || !largeDiscContainer || !playerReady || !player) {
            // console.log("handleDiscDragMove aborted: Not dragging or elements missing.");
            return;
        }

        // We need preventDefault here if the touchmove listener is not passive.
        // If it IS passive, preventDefault() will have no effect and might log a warning.
        // Since we set { passive: false } on touchstart/touchmove, this is correct.
        event.preventDefault();

        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        // Check if movement exceeds threshold to confirm drag
        if (!isConfirmedDrag) {
            const deltaXThreshold = Math.abs(clientX - startDragX);
            const deltaYThreshold = Math.abs(clientY - startDragY);
             // Log delta values
            // console.log(`Drag move check: DeltaX=${deltaXThreshold.toFixed(1)}, DeltaY=${deltaYThreshold.toFixed(1)}, Threshold=${DRAG_THRESHOLD}`);
            if (deltaXThreshold > DRAG_THRESHOLD || deltaYThreshold > DRAG_THRESHOLD) {
                isConfirmedDrag = true;
                clearTimeout(holdTimer); // Cancel hold timer if drag is confirmed
                console.log("Drag confirmed, hold cancelled.");

                // --- Pause video and stop animation ONLY when drag is confirmed ---
                if (wasPlayingBeforeDrag && typeof player.pauseVideo === 'function') {
                    player.pauseVideo();
                    console.log("Scratch Move: Paused video due to confirmed drag.");
                }
                if (largeDiscContainer) {
                    largeDiscContainer.classList.remove('playing'); // Stop CSS animation for drag
                    // Disable CSS transitions during drag for smooth JS rotation
                    largeDiscContainer.style.transition = 'none';
                }
                // --------------------------------------------------------------------
            } else {
                 // Log if drag threshold not met
                 // console.log("Drag threshold not met yet.");
            }
        }

        // Only rotate and seek if it's a confirmed drag
        if (!isConfirmedDrag) {
             // Log if trying to move but drag is not confirmed
             // console.log("handleDiscDragMove: Drag not confirmed, skipping rotation/seek.");
            return;
        }

        // Log that rotation/seek logic is being executed
        console.log("handleDiscDragMove: Executing rotation and seek logic...");

        // --- NEW Drag Rotation Logic based on deltaX ---
        const deltaX = clientX - prevDragX;
        const deltaRotation = deltaX * VISUAL_ROTATION_SENSITIVITY; // Calculate rotation change based on horizontal movement
        currentDiscRotation += deltaRotation; // Accumulate rotation

        if (largeDisc) { // Apply to the inner disc element
            largeDisc.style.transform = `rotate(${currentDiscRotation}deg)`;
        }
        // Update prevDragX for the next move event
        prevDragX = clientX;
        // Log rotation applied
        // console.log(`Rotation applied: DeltaX: ${deltaX.toFixed(1)}, DeltaRot: ${deltaRotation.toFixed(1)}, CurrentRot: ${currentDiscRotation.toFixed(1)}deg`);

        // --- Seek Video Based on Rotation (Throttled) ---
        clearTimeout(throttleSeekTimer);
        throttleSeekTimer = setTimeout(() => {
            // Log inside timeout before check
            // console.log("Seek timeout executing...");
            if (!isDraggingDisc || !isConfirmedDrag) {
                // Log if seek is aborted inside timeout
                // console.log("Seek aborted inside timeout: Drag ended or was cancelled.");
                return;
            }

            // --- Seek calculation based on TOTAL rotation since drag start ---
            const currentDeltaRotationSinceDragStart = currentDiscRotation - initialDiscRotationOnDragStart;
            // const sensitivity = 8; // Use the defined constant SEEK_SENSITIVITY
            const deltaTime = currentDeltaRotationSinceDragStart / SEEK_SENSITIVITY; // Calculate time change based on total rotation and seek sensitivity
            const videoDuration = player.getDuration();

            // Ensure player functions and duration are available
            if (typeof player.getCurrentTime !== 'function' || typeof player.seekTo !== 'function' || !videoDuration) {
                console.warn("Cannot get current time, seekTo, or duration to seek.");
                return;
            }

            try {
                const currentTime = player.getCurrentTime(); // Get current time directly (returns Number)
                let targetTime = currentTime + deltaTime;
                targetTime = Math.max(0, Math.min(targetTime, videoDuration)); // Clamp target time within bounds

                // Seek only if time changed significantly
                if (Math.abs(targetTime - currentTime) > 0.05) {
                    // Log before seeking
                    console.log(`Seeking: Delta Rotation: ${currentDeltaRotationSinceDragStart.toFixed(1)}, Delta Time: ${deltaTime.toFixed(2)}, Current: ${currentTime.toFixed(2)}, Target: ${targetTime.toFixed(2)}`);
                    player.seekTo(targetTime, true); // Seek and allow seeking ahead
                    // Update seek bar immediately after scratch seek
                    updateSeekBarUI(targetTime, videoDuration);
                    // IMPORTANT: Reset initialDiscRotationOnDragStart and currentTime for the *next* seek calculation within the same drag
                    // This makes subsequent seeks relative to the *last* seek point, not the original drag start.
                    initialDiscRotationOnDragStart = currentDiscRotation;
                    // We don't need to manually reset currentTime, as the next iteration will get the fresh currentTime after the seek.

                }
            } catch (error) {
                 console.error("Error during seek operation:", error);
            }
        }, SEEK_THROTTLE_MS);
    }

    function handleDiscDragEnd(event) {
        // Always clear timers first thing on mouseup/touchend
        clearTimeout(holdTimer);
        clearTimeout(throttleSeekTimer);

        if (!isDraggingDisc) return; // Only run if an interaction was actually started

        const wasHoldActive = isHoldingDisc;    // Capture state before resetting
        const wasDragAction = isConfirmedDrag; // Capture state before resetting
        const interactionStartTime = dragStartTime; // Store start time (assuming you have a variable like dragStartTime)
        const interactionEndTime = Date.now();
        const interactionDuration = interactionEndTime - interactionStartTime;

        // Reset interaction state flags immediately
        isDraggingDisc = false;
        isConfirmedDrag = false;
        isHoldingDisc = false;
        startDragX = 0;
        startDragY = 0;
        prevDragX = 0; // Reset previous drag position
        // dragStartTime = 0; // Reset start time

        // 再生情報の表示・非表示を制御する要素を取得
        const currentTrackInfo = document.getElementById('current-track-info');

        // Restore UI elements (cursor, selection, transition, transform)
        if(largeDiscContainer) {
             largeDiscContainer.style.cursor = 'grab';
             largeDiscContainer.style.userSelect = '';
             // Restore CSS transitions (remove inline style)
             largeDiscContainer.style.transition = '';
             // Clear inline transform applied during drag to the container - NO! Keep rotation
             // largeDiscContainer.style.transform = '';
             // Clear inline transform applied during drag to the inner disc
             if (largeDisc) {
                 // Keep the final rotation visually
                 // largeDisc.style.transform = ''; // Don't reset transform on drag end
             }
        }
        document.body.style.userSelect = '';

        // --- NEW: Handle Tap First ---
        // A tap is defined as: not a hold AND not a confirmed drag.
        if (!wasHoldActive && !wasDragAction) {
             console.log(`Tap Detected (Duration: ${interactionDuration}ms). 一時停止します。`);

             // 再生/一時停止を切り替え
             if (isPlaying) {
                 // 再生中なら一時停止
                 if (playerReady && player && typeof player.pauseVideo === 'function') {
                     try { 
                         player.pauseVideo();
                         console.log("Disc Tap: Pausing video.");
                         isPausedByDiscInteraction = true; // ディスク操作による一時停止
                     }
                     catch(e) { console.error("Error pausing video on tap:", e); }
                 }
                 
                 // 一時停止したときも再生情報とシークバーは表示したまま
                 if (currentTrackInfo) {
                     currentTrackInfo.classList.add('visible');
                 }
                 if (seekBarContainer) {
                     seekBarContainer.classList.add('visible');
                 }
             } else {
                 // 一時停止中なら再生
                 if (playerReady && player && typeof player.playVideo === 'function') {
                     try { 
                         player.playVideo();
                         console.log("Disc Tap: Resuming video.");
                         isPausedByDiscInteraction = false;
                     }
                     catch(e) { console.error("Error resuming video on tap:", e); }
                 }
             }

             // ディスクは引っ込めない（retractedクラスの追加やvisibleクラスの削除を行わない）

             // Don't proceed to other handlers (hold/drag end)
             return;
        }

        // --- Handle Hold End ---
        if (wasHoldActive) {
            console.log("Hold End: Releasing. Initial state was:", wasPlayingBeforeDrag ? "Playing" : "Paused");
             // No need to clear transform for hold release if we keep rotation
            if (wasPlayingBeforeDrag && player && typeof player.playVideo === 'function') {
                player.playVideo();
                console.log("Hold End: Resuming video.");
                isPausedByDiscInteraction = false; // 再生再開したのでリセット
                // Let onPlayerStateChange handle adding 'playing' class.
            } else {
                console.log("Hold End: Video remains paused (was originally paused or playVideo failed).");
                isPausedByDiscInteraction = true; // ディスク操作によって一時停止状態を維持
                if(largeDiscContainer) {
                    largeDiscContainer.classList.remove('playing');
                }
                // 一時停止していても再生情報とシークバーは表示したままに
                if (currentTrackInfo) {
                    currentTrackInfo.classList.add('visible');
                }
                if (seekBarContainer) {
                    seekBarContainer.classList.add('visible');
                }
            }
        }
        // --- Handle Drag End (Not Hold) ---
        else if (wasDragAction) {
            console.log("Scratch End (Drag): Stopped. Initial state was:", wasPlayingBeforeDrag ? "Playing" : "Paused");
            // No need to clear transform for drag end if we keep rotation
            if (wasPlayingBeforeDrag && player && typeof player.playVideo === 'function') {
                player.playVideo();
                console.log("Scratch End (Drag): Resuming video.");
                isPausedByDiscInteraction = false; // 再生再開したのでリセット
            } else {
                console.log("Scratch End (Drag): Video remains paused.");
                isPausedByDiscInteraction = true; // ディスク操作によって一時停止状態を維持
                if(largeDiscContainer) {
                    largeDiscContainer.classList.remove('playing');
                }
                // 一時停止していても再生情報とシークバーは表示したままに
                if (currentTrackInfo) {
                    currentTrackInfo.classList.add('visible');
                }
                if (seekBarContainer) {
                    seekBarContainer.classList.add('visible');
                }
            }
        }
        // --- REMOVED Original Click/Tap Toggle Logic ---
        // The new tap logic handles the click/tap case completely.

        // Reset angle/rotation state AFTER processing the action end
        // startDragAngle = 0; // No longer used
        initialDiscRotationOnDragStart = 0; // Reset for next drag
        // Reset wasPlayingBeforeDrag AFTER using it to determine the action outcome
        wasPlayingBeforeDrag = false;
    }

    // Function to add listeners
    function addScratchListeners() {
        if (!largeDiscContainer) {
            console.error("Cannot add scratch listeners, largeDiscContainer not found.");
            return;
        }
        console.log("Adding scratch listeners to:", largeDiscContainer);

        // Cleanup previous listeners if function is ever called again (defensive)
        largeDiscContainer.removeEventListener('mousedown', handleDiscDragStart);
        document.removeEventListener('mousemove', handleDiscDragMove);
        document.removeEventListener('mouseup', handleDiscDragEnd);
        largeDiscContainer.removeEventListener('touchstart', handleDiscDragStart);
        document.removeEventListener('touchmove', handleDiscDragMove);
        document.removeEventListener('touchend', handleDiscDragEnd);
        document.removeEventListener('touchcancel', handleDiscDragEnd);

        // Mouse Events
        largeDiscContainer.addEventListener('mousedown', handleDiscDragStart);
        // Add listeners to document to catch mouseup/mousemove outside the element
        document.addEventListener('mousemove', handleDiscDragMove);
        document.addEventListener('mouseup', handleDiscDragEnd);

        // Touch Events (use passive: false to allow preventDefault)
        largeDiscContainer.addEventListener('touchstart', handleDiscDragStart, { passive: false });
        document.addEventListener('touchmove', handleDiscDragMove, { passive: false });
        document.addEventListener('touchend', handleDiscDragEnd);
        document.addEventListener('touchcancel', handleDiscDragEnd); // Handle interruptions

        // Initial cursor style
        largeDiscContainer.style.cursor = 'grab';
    }

    // --- Existing Functions (ensure they don't conflict) ---

    // --- Function to load Catalog from Google Apps Script Web App ---
    async function loadCatalogFromWebApp(url) {
        console.log("Attempting to load catalog from Web App URL:", url);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Handle potential redirect or other fetch issues more gracefully
                if (response.status === 0) {
                     throw new Error('Network error or CORS issue accessing the script URL.');
                } else {
                     throw new Error(`HTTP error ${response.status} (${response.statusText})`);
                }
            }
            const data = await response.json();
            console.log("JSON Data fetched:", data);

            // Validate and structure the data
            if (!Array.isArray(data)) {
                // Check if it's an error object from Apps Script
                if (data && data.error) {
                     throw new Error(`Apps Script Error: ${data.message}`);
                }
                throw new Error("Invalid data format received from API.");
            }

            allTags = new Set(); // Reset tags before processing
            catalog = data.map((item, index) => {
                console.log(`Processing item ${index}:`, item);
                if (!item || typeof item.videoId !== 'string' || item.videoId.trim() === '') {
                    console.warn(`Item at index ${index} is skipped. Missing or invalid videoId. videoId value:`, item?.videoId);
                    return null;
                }
                // Process tags
                const tags = Array.isArray(item.tags) ? item.tags : [];
                tags.forEach(tag => allTags.add(tag)); // Collect unique tags
                
                console.log(`Item ${index} is valid. videoId: ${item.videoId}, title: ${item.title}, artist: ${item.artist}, genre: ${item.genre}`);
                return {
                    id: `item-${index}`,
                    videoId: item.videoId,
                    title: item.title || 'Untitled',
                    artist: item.artist || 'Unknown Artist',
                    tags: tags // Store tags array
                };
            }).filter(item => item !== null); // Filter out nulls from skipped items

            if (catalog.length === 0) {
                console.warn("Catalog loaded, but is empty or contains no valid entries after validation.");
            }
            console.log("Catalog processed:", catalog);
            console.log("All unique tags found:", Array.from(allTags));
            return true;
        } catch (error) {
            console.error("Failed to load or process catalog from Web App:", error);
            displayGlobalError(`カタログデータの読み込みに失敗しました: ${error.message}`);
            catalog = [];
            allTags = new Set();
            return false;
        }
    }

    // --- YouTube IFrame API Setup ---
    window.onYouTubeIframeAPIReady = function() {
        console.log("onYouTubeIframeAPIReady called");
        const playerElement = document.getElementById('youtube-player');
        if (!playerElement) {
            console.error("YouTube Player element (#youtube-player) not found in DOM!");
            displayGlobalError("Player container missing.");
            return;
        }
        try {
            player = new YT.Player('youtube-player', {
                height: '1',
                width: '1',
                playerVars: {
                    'autoplay': 0,
                    'controls': 0,
                    'showinfo': 0,
                    'rel': 0,
                    'iv_load_policy': 3,
                    'modestbranding': 1,
                    'playsinline': 1
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange,
                    'onError': onPlayerError
                }
            });
            console.log("YT.Player instance creation requested.");
        } catch (error) {
            console.error("Error creating YT.Player instance:", error);
            displayGlobalError("Failed to initialize YouTube player.");
        }
    };

    // --- Player Event Handlers ---
    async function onPlayerReady(event) {
        console.log("Player Ready!", event.target);
        if (!player) {
            console.error("onPlayerReady called, but 'player' is not defined!");
            return;
        }
        try {
            // Set initial volume and update slider UI
            const initialVolume = 50; // Or get from storage if saved
            currentVolumeValue = initialVolume; // グローバル変数も更新
            player.setVolume(initialVolume);
            if (volumeTrack && volumeThumb) { // ★ Check custom elements
                updateVolumeSliderUI(initialVolume); // Update custom slider UI
                addCustomVolumeSliderListeners(); // ★ Add listeners for custom slider
            }

            playerReady = true;
            console.log("Player marked as ready.");

            if (!catalogContainer || !tagFilterContainer) { // Wait for tag container too
                console.log("DOM elements not ready yet in onPlayerReady, trying again...");
                setTimeout(() => onPlayerReady(event), 100);
                return;
            }

            const catalogLoaded = await loadCatalogFromWebApp(WEB_APP_URL);

            if (catalogLoaded) {
                displayTagFilters(); // Display tag buttons after catalog load
                if (catalog.length > 0) {
                    console.log("Loading first video from loaded catalog:", catalog[0].videoId);
                    // player.cueVideoById(catalog[0].videoId); // Let loadCatalog handle initial state maybe?
                    loadCatalog(); // Load initial catalog view (all items)
                } else {
                    console.log("Catalog loaded but is empty.");
                    loadCatalog(); // Display empty message
                }
            } else {
                console.error("Catalog loading failed, cannot proceed.");
                displayTagFilters(); // Display at least the 'All' button even on error
                loadCatalog(); // Display error message via global error handler
            }

        } catch(error) {
            console.error("Error during onPlayerReady:", error);
            displayGlobalError("Error configuring player or loading catalog.");
        }
    }

    function onPlayerError(event) {
        console.error("YouTube Player Error Code:", event.data);
         let errorMsg = `YT Error ${event.data}`;
         switch(event.data) {
             case 2: errorMsg = "Invalid Video ID"; break;
             case 5: errorMsg = "Player Error (HTML5)"; break;
             case 100: errorMsg = "Video Not Found"; break;
             case 101: case 150: errorMsg = "Playback Restricted"; break;
             default: errorMsg = `Unknown Error ${event.data}`;
         }
         console.error(errorMsg);

         // Display error on the specific card if possible
         if (currentPlayerCardId) {
            updateCardText(currentPlayerCardId, '再生エラー', errorMsg);
         }
    }

    function onPlayerStateChange(event) {
        if (!playerReady) {
             console.warn("onStateChange received before player was ready. Ignoring.");
             return;
        }
         console.log(`Player State Changed: ${event.data} (Current ID: ${currentPlayerCardId || 'None'})`);

        // Clear previous interval timer regardless of state
        clearInterval(seekBarUpdateInterval);
        seekBarUpdateInterval = null;

        // 再生中情報の表示/非表示を制御
        const currentTrackInfo = document.getElementById('current-track-info');
        
        console.log("Track info element:", currentTrackInfo); // デバッグ追加

        // Only interact with disc animation if not currently dragging
        if (!isDraggingDisc) {
            if (event.data === YT.PlayerState.PLAYING) {
                isPlaying = true;
                isPausedByDiscInteraction = false; // 再生状態になったらリセット
                isLoadingNewTrack = false; // 再生開始で読み込み完了
                if (largeDiscContainer) largeDiscContainer.classList.add('playing');
                // Start updating seek bar when playing
                startSeekBarUpdates();
                if (seekBarContainer) seekBarContainer.classList.add('visible'); // Show seek bar
                // 再生中情報を表示（クラスを使用）
                if (currentTrackInfo) {
                    console.log("Adding visible class to track info");
                    currentTrackInfo.classList.add('visible');
                }
                // 再生開始時、カップを現在のカード上に固定（未配置の場合）
                if (cupCursor && !cupPlacedOnCard && currentPlayerCardId) {
                    const currentCardEl = document.getElementById(currentPlayerCardId);
                    if (currentCardEl) {
                        moveCupInstantToCard(currentCardEl);
                    }
                }
                // 再生モードコントロールを表示
                if (playbackControlContainer) {
                    playbackControlContainer.classList.add('visible');
                }
            } else {
                // Stop for PAUSED, ENDED, BUFFERING, CUED, UNSTARTED
                isPlaying = false;
                if (largeDiscContainer) largeDiscContainer.classList.remove('playing');
                // Update seek bar one last time when paused/stopped
                updateSeekBarUI();
                
                // 完全停止（UNSTARTED）の場合はカップをリセット
                // ただし、新しいトラックの読み込み中（isLoadingNewTrack = true）の場合はリセットしない
                if (event.data === YT.PlayerState.UNSTARTED && !isLoadingNewTrack) {
                    resetCupFromCard();
                }
                
                if (event.data !== YT.PlayerState.BUFFERING) { // バッファリング中は表示したまま
                    // ディスク操作による一時停止かどうかをチェック
                    if (!isPausedByDiscInteraction) {
                        // 通常の停止処理（ディスク操作以外）
                        if (seekBarContainer) seekBarContainer.classList.remove('visible'); // シークバーを非表示
                        if (currentTrackInfo) {
                            currentTrackInfo.classList.remove('visible'); // 再生情報を非表示
                            console.log('自動処理による再生情報非表示');
                        }
                        // 再生モードコントロールを非表示
                        if (playbackControlContainer) {
                            playbackControlContainer.classList.remove('visible');
                        }
                    } else {
                        // ディスク操作による一時停止の場合は表示を維持
                        if (seekBarContainer) seekBarContainer.classList.add('visible'); // シークバーを表示
                        if (currentTrackInfo) {
                            currentTrackInfo.classList.add('visible'); // 再生情報を表示
                            console.log('ディスク操作による一時停止: 情報表示維持');
                        }
                        // 再生モードコントロールも表示維持
                        if (playbackControlContainer) {
                            playbackControlContainer.classList.add('visible');
                        }
                    }
                }
            }
        } else {
            // If dragging, keep isPlaying based on YT state for internal logic.
            console.log("State change while dragging, visual animation handled by drag handler.");
            if(event.data !== YT.PlayerState.PLAYING) {
                isPlaying = false;
                // ドラッグ中は再生情報を表示したまま
            } else {
                isPlaying = true; // Update internal state
                if (currentTrackInfo) currentTrackInfo.classList.add('visible');
                // ドラッグ中も再生モードコントロールを表示
                if (playbackControlContainer) playbackControlContainer.classList.add('visible');
            }
             // Don't start/stop interval or change visibility while dragging
        }

        // Handle specific state actions
        if (event.data !== YT.PlayerState.PLAYING) {
            stopSoundBars(); // Stop catalog card sound bars
        }

        switch (event.data) {
            case YT.PlayerState.PLAYING:
                if (currentPlayerCardId) {
                    activateCard(currentPlayerCardId);
                    showBottomPlayer();
                } else {
                     console.warn("PLAYING state, but currentPlayerCardId is not set.");
                }
                break;

            case YT.PlayerState.PAUSED:
                deactivateCard(currentPlayerCardId);
                // 一時停止状態でもディスク操作によるものなら情報表示を維持
                // ※上部のif文で処理しているので、ここでは特別な処理は不要
                break;

            case YT.PlayerState.ENDED:
                deactivateCard(currentPlayerCardId);
                console.log("Playback ended for:", currentVideoId);
                
                // 次の曲を再生（連続再生またはランダム再生）
                playNextTrack();
                return; // 次の曲を再生する場合は以降の処理をスキップ
                
                // これより下の処理は、次の曲を再生しない場合の処理なので削除または無効化
                // hideBottomPlayer();
                // updateSeekBarUI(0, player.getDuration()); // Reset bar to start
                // 再生終了時は情報も非表示
                // if (currentTrackInfo) currentTrackInfo.classList.remove('visible');
                // if (seekBarContainer) seekBarContainer.classList.remove('visible');
                // if (playbackControlContainer) playbackControlContainer.classList.remove('visible');
                break;

            case YT.PlayerState.BUFFERING:
                console.log("Player buffering...");
                if (seekBarContainer) seekBarContainer.classList.add('visible'); // Ensure visible while buffering
                // バッファリング中も再生モードコントロールを表示
                if (playbackControlContainer) playbackControlContainer.classList.add('visible');
                break;

            case YT.PlayerState.CUED:
                console.log("Video cued:", currentVideoId || player?.getVideoData()?.video_id || 'N/A');
                updateSeekBarUI(0, player.getDuration()); // Reset bar to start when cued
                 if (!isPlaying && !isPausedByDiscInteraction) { // ディスク操作による一時停止でなければ非表示
                     hideBottomPlayer();
                     if (seekBarContainer) seekBarContainer.classList.remove('visible');
                     // 再生していない時は情報も非表示
                     if (currentTrackInfo) currentTrackInfo.classList.remove('visible');
                     // 再生モードコントロールも非表示
                     if (playbackControlContainer) playbackControlContainer.classList.remove('visible');
                 }
                break;

            default: // Includes UNSTARTED (-1)
                 if (!isPlaying && !isPausedByDiscInteraction) { // ディスク操作による一時停止でなければ非表示
                      hideBottomPlayer();
                      if (seekBarContainer) seekBarContainer.classList.remove('visible');
                      // 再生していない時は情報も非表示
                      if (currentTrackInfo) currentTrackInfo.classList.remove('visible');
                      // 再生モードコントロールも非表示
                     if (playbackControlContainer) playbackControlContainer.classList.remove('visible');
                 }
                 // Reset seek bar for unstarted/error states
                 updateSeekBarUI(0, 0);
        }
    }

    // --- UI Creation and Management ---

    function createNowPlayingIndicatorSVG() {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 10 10");
        svg.setAttribute("preserveAspectRatio", "none");

        for (let i = 0; i < 3; i++) {
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", (i * 3.3).toString());
            rect.setAttribute("y", "8");
            rect.setAttribute("width", "2.5");
            rect.setAttribute("height", "2");
            rect.setAttribute("rx", "0.5");
            rect.setAttribute("ry", "0.5");
            svg.appendChild(rect);
        }
        return svg;
    }

    function animateSoundBars(svgElement) {
        if (!svgElement) { console.warn("animateSoundBars: No SVG element provided."); return; }
        const bars = svgElement.querySelectorAll('rect');
        if (bars.length !== 3) { console.warn("animateSoundBars: Did not find 3 rect elements in SVG."); return; }

        stopSoundBars(); // Clear existing interval

        soundBarInterval = setInterval(() => {
            bars.forEach(bar => {
                const randomHeight = Math.max(1, Math.random() * 9 + 1);
                bar.setAttribute('height', randomHeight.toFixed(1));
                bar.setAttribute('y', (10 - randomHeight).toFixed(1));
            });
        }, 180);
    }

    function stopSoundBars() {
        if (soundBarInterval) {
            clearInterval(soundBarInterval);
            soundBarInterval = null;
            // Reset bars visually
             document.querySelectorAll('.now-playing.active svg rect').forEach(bar => {
                 bar.setAttribute('height', '2');
                 bar.setAttribute('y', '8');
             });
        }
    }

    function createPlayerCard(item) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.id = item.id;
        card.dataset.videoId = item.videoId;

        const discContainer = document.createElement('div');
        discContainer.className = 'disc-container';
        discContainer.id = `disc-container-${item.id}`;

        const disc = document.createElement('div');
        disc.className = 'disc';

        const thumbnail = document.createElement('img');
        thumbnail.className = 'thumbnail';
        thumbnail.src = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
        thumbnail.alt = `Thumbnail for ${item.title || item.videoId}`;
        thumbnail.loading = 'lazy';
        thumbnail.onerror = function() { this.src = 'placeholder.png'; }; // Placeholder

        disc.appendChild(thumbnail);
        discContainer.appendChild(disc);

        const trackInfo = document.createElement('div');
        trackInfo.className = 'track-info';

        const trackTitle = document.createElement('div');
        trackTitle.className = 'track-title';
        trackTitle.id = `track-title-${item.id}`;
        trackTitle.textContent = item.title;

        const trackArtist = document.createElement('div');
        trackArtist.className = 'track-artist';
        trackArtist.id = `track-artist-${item.id}`;
        trackArtist.textContent = item.artist;

        // Display Tags instead of Genre
        const tagsP = document.createElement('p'); 
        tagsP.className = 'catalog-tags'; // Use a new class for styling if needed
        tagsP.textContent = item.tags.length > 0 ? `#${item.tags.join(' #')}` : '-'; // Join tags with #
        
        

        trackInfo.appendChild(trackTitle);
        trackInfo.appendChild(trackArtist);
        trackInfo.appendChild(tagsP); // Add tags paragraph

        const nowPlaying = document.createElement('div');
        nowPlaying.className = 'now-playing';
        nowPlaying.id = `now-playing-${item.id}`;
        try {
            nowPlaying.appendChild(createNowPlayingIndicatorSVG());
        } catch(e) {
            console.error("Error creating SVG indicator:", e);
            nowPlaying.textContent = "Err";
        }

        card.appendChild(discContainer);
        card.appendChild(trackInfo);
        card.appendChild(nowPlaying);

        card.addEventListener('click', () => handleCardClick(item));

        return card;
    }

    function handleCardClick(item) {
        console.log(`Card clicked: ${item.id} (Video: ${item.videoId})`);
        if (!playerReady || !player) {
            console.warn("Player not ready or missing. Click ignored.");
            return;
        }

        // If currently dragging the disc, stop the drag first
        if (isDraggingDisc) {
            // Create a dummy event or just call the handler
            handleDiscDragEnd({ preventDefault: () => {} }); // Pass dummy event obj
            console.log("Card Click: Cancelled active disc drag.");
        }

        // カップをカードに移動させる
        const cardElement = document.getElementById(item.id);
        if (cardElement && cupCursor) {
            // 既存のトラッキングを停止してから新しいカードへ移動
            stopCupPositionTracking();
            moveCupToCard(cardElement, () => {
                // カップがカードに到達した後に再生処理を実行
                executePlayback(item);
            });
        } else {
            // カップ要素がない場合は通常通り再生
            executePlayback(item);
        }
    }

    function executePlayback(item) {
        if (currentPlayerCardId === item.id) {
            console.log("Same card clicked — 完全停止します");
            
            // 1. Stop Playback completely
            if (playerReady && player && typeof player.stopVideo === 'function') {
                try { 
                    player.stopVideo();
                    console.log("Same card click: Stopping video completely.");
                }
                catch(e) { console.error("Error stopping video on card click:", e); }
            }
            isPlaying = false;
            isPausedByDiscInteraction = false;
            isLoadingNewTrack = false; // 停止時にもリセット

            // 2. Reset related UI elements (like sound bars, card visuals)
            resetAllPlayerCardVisuals();
            stopSoundBars();

            // 3. カップをカードから離す
            resetCupFromCard();

            // 4. Trigger retraction animation
            if (bottomPlayerContainer) {
                bottomPlayerContainer.classList.add('retracted');
                // Remove 'visible' class to ensure it animates correctly with the 'bottom' property change
                bottomPlayerContainer.classList.remove('visible');
                console.log("Added 'retracted', removed 'visible'");
            }

            // 5. Clear large disc transform just in case
            if(largeDiscContainer && largeDisc) {
                // Reset visual rotation on tap/retract
                currentDiscRotation = 0;
                largeDisc.style.transform = `rotate(${currentDiscRotation}deg)`;
                largeDiscContainer.classList.remove('playing'); // Ensure spin animation is off
            }

            // 6. Hide track info
            const currentTrackInfo = document.getElementById('current-track-info');
            if (currentTrackInfo) {
                currentTrackInfo.classList.remove('visible');
            }

            // 7. Hide and reset seek bar
            if (seekBarContainer) {
                seekBarContainer.classList.remove('visible');
                // Clear any update interval
                clearInterval(seekBarUpdateInterval);
                seekBarUpdateInterval = null;
            }
            // Reset seek bar to start position
            updateSeekBarUI(0, 0);

            // Reset state variables related to current track
            currentPlayerCardId = null;
            currentVideoId = null;
            
            return; // Don't proceed to load the same video again
        }
        else {
            // Clicked a different card
            console.log(`Switching to: ${item.id}`);
            if (currentPlayerCardId) {
                deactivateCard(currentPlayerCardId);
            }
            stopSoundBars(); // Stop catalog card animation

            currentPlayerCardId = item.id;
            currentVideoId = item.videoId;

            // Reset visual rotation state for the new track
            currentDiscRotation = 0;
            if (largeDiscContainer) {
                largeDiscContainer.style.transform = ''; // Remove any inline rotation
                largeDiscContainer.classList.remove('playing'); // Ensure animation is off initially
            }

            updateLargeDiscInfo(item); // ★ Add this call back

            console.log("Loading video:", item.videoId);
            // Load and automatically play the new video
            if (typeof player.loadVideoById === 'function') {
                player.loadVideoById({videoId: item.videoId, startSeconds: 0}); // Load new video
                // Playback should be handled by onStateChange
            } else {
                console.error("Cannot load new video, loadVideoById not available.");
            }
        }
    }

    function activateCard(cardId) {
        if (!cardId) return;
        console.log("Activating card:", cardId);
        resetAllPlayerCardVisuals();

        const cardElement = document.getElementById(cardId);
        if (!cardElement) { console.warn(`activateCard: Card element ${cardId} not found.`); return; }

        cardElement.classList.add('playing');
        cardElement.classList.add('active');

        cardElement.querySelector('.disc-container')?.classList.add('playing');
        const nowPlayingIndicator = cardElement.querySelector('.now-playing');
        if (nowPlayingIndicator) {
            nowPlayingIndicator.classList.add('active');
            const svg = nowPlayingIndicator.querySelector('svg');
            if (svg) {
                animateSoundBars(svg);
            } else {
                 console.warn("activateCard: SVG indicator not found in", cardId);
            }
        }
    }

    function deactivateCard(cardId) {
        if (!cardId) return;
        const cardElement = document.getElementById(cardId);
         if (!cardElement) return;

        cardElement.classList.remove('playing');
        cardElement.classList.remove('active');
        cardElement.querySelector('.disc-container')?.classList.remove('playing');
        cardElement.querySelector('.now-playing')?.classList.remove('active');
    }

    function resetAllPlayerCardVisuals() {
         document.querySelectorAll('.player-card').forEach(card => {
            card.classList.remove('playing');
            card.classList.remove('active');
            card.querySelector('.disc-container')?.classList.remove('playing');
            card.querySelector('.now-playing')?.classList.remove('active');
         });
    }

    function showBottomPlayer() {
        if (bottomPlayerContainer) {
            console.log("Showing bottom player.");
            bottomPlayerContainer.classList.remove('retracted'); // Remove retracted class if present
            bottomPlayerContainer.classList.add('visible');
        }
        // ボトムプレイヤーを表示する時に再生モードコントロールも表示
        if (playbackControlContainer) {
            playbackControlContainer.classList.add('visible');
        }
    }

    function hideBottomPlayer() {
        if (bottomPlayerContainer) {
            console.log("Hiding bottom player.");
            bottomPlayerContainer.classList.remove('visible');
            // Optional: Ensure retracted is also removed when explicitly hidden, though tap handles this.
            // bottomPlayerContainer.classList.remove('retracted');
        }
        // ボトムプレイヤーを非表示にする時に再生モードコントロールも非表示
        if (playbackControlContainer) {
            playbackControlContainer.classList.remove('visible');
        }
    }

    function loadCatalog() {
        // Increment ID for this execution
        const executionId = ++currentLoadCatalogExecutionId;
        console.log(`--- loadCatalog Start (ID: ${executionId}) ---`);

        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) loadingMessage.remove();
        if (!catalogContainer) return;

        // --- Cancel previous animation cleanup listeners ---
        // Remove 'flipping' class and associated listeners from previous runs forcefully
        // This helps prevent stale listeners or styles if transitions were interrupted.
        catalogContainer.querySelectorAll('.player-card.flipping').forEach(card => {
            card.classList.remove('flipping');
            // Note: Removing specific event listeners added dynamically can be complex.
            // Relying on {once: true} and the executionId check inside listeners is generally safer.
            // If issues persist, a more robust listener management system might be needed.
            console.log(`Force cleanup flipping class for card ${card.id} (Run ID: ${executionId})`);
        });


        const filteredCatalog = selectedTag === null
            ? catalog
            : catalog.filter(item => item.tags.includes(selectedTag));

        if (cupPlacedOnCard && currentPlayerCardId) {
            const currentCardStillVisible = filteredCatalog.some(item => item.id === currentPlayerCardId);
            if (!currentCardStillVisible) {
                resetCupFromCard();
            }
        }

        const currentFilteredIds = new Set(filteredCatalog.map(item => item.id));
        // Get the CURRENT state of cards in the DOM right now
        const allCardElementsInDOM = Array.from(catalogContainer.querySelectorAll('.player-card'));

        // --- Classify Cards (based on current DOM state and target filter) ---
        const cardsToRemainVisible = [];
        const cardsToFadeIn = [];
        const cardsToFadeOut = [];

        // Newly added cards (based on catalog, not yet in DOM)
        filteredCatalog.forEach(item => {
            if (!document.getElementById(item.id)) {
                const newCard = createPlayerCard(item);
                newCard.classList.add('hidden');
                cardsToFadeIn.push(newCard);
            }
        });

        // Existing cards in DOM
        allCardElementsInDOM.forEach(card => {
            const cardId = card.id;
            const isCurrentlyVisible = !card.classList.contains('hidden');
            const willBeVisible = currentFilteredIds.has(cardId);

            if (isCurrentlyVisible && willBeVisible) {
                cardsToRemainVisible.push(card);
            } else if (isCurrentlyVisible && !willBeVisible) {
                cardsToFadeOut.push(card);
            } else if (!isCurrentlyVisible && willBeVisible) {
                cardsToFadeIn.push(card); // Will be revealed
            } else if (!isCurrentlyVisible && !willBeVisible) {
                // Hidden and should remain hidden (or be removed if in DOM incorrectly)
                 // Ensure it's marked for removal if it exists but shouldn't
                 if (!currentFilteredIds.has(cardId)) {
                      // It's hidden and not in the target filter. If it's somehow still animating
                      // or scheduled for removal, let that proceed or handle cleanup.
                      // If it's just sitting there hidden, it might be removed by the Promise logic later
                      // if the previous transitionend didn't fire correctly.
                 }
            }
        });
         console.log(`(ID: ${executionId}) Classification: Remain=${cardsToRemainVisible.length}, FadeIn=${cardsToFadeIn.length}, FadeOut=${cardsToFadeOut.length}`);

        // --- FLIP: First ---
        const initialPositions = new Map();
        cardsToRemainVisible.forEach(card => {
            initialPositions.set(card.id, card.getBoundingClientRect());
        });
        console.log(`(ID: ${executionId}) FLIP First: Recorded positions for ${cardsToRemainVisible.length} cards.`);

        // --- DOM Updates ---

        // 1. Add new cards (hidden)
        cardsToFadeIn.forEach(card => {
            if (!document.getElementById(card.id)) { // Double check it wasn't added somehow
                catalogContainer.appendChild(card);
            }
        });

        // 2. Start fade-out for cards to be removed
        const fadeOutPromises = cardsToFadeOut.map(card => {
            return new Promise(resolve => {
                 // Check if the execution is still the latest before adding listener
                if (executionId !== currentLoadCatalogExecutionId) {
                     console.log(`(ID: ${executionId}) Fade-out Promise skipped for ${card.id} (stale execution)`);
                     resolve({card, skipped: true}); // Resolve immediately indicating skip
                     return;
                }

                if (!card.classList.contains('hidden')) {
                    card.classList.add('hidden');
                    const fallbackTimeout = setTimeout(() => {
                        // Check executionId inside timeout too
                        if (executionId === currentLoadCatalogExecutionId) {
                            console.warn(`(ID: ${executionId}) Fade-out fallback timeout for ${card.id}`);
                             resolve({card, skipped: false});
                        } else {
                             console.log(`(ID: ${executionId}) Fade-out fallback skipped for ${card.id} (stale execution)`);
                             resolve({card, skipped: true});
                        }
                    }, 700);

                    card.addEventListener('transitionend', function handler(event) {
                         // Check executionId inside listener
                        if (event.propertyName === 'opacity' && card.classList.contains('hidden')) {
                             clearTimeout(fallbackTimeout);
                            if (executionId === currentLoadCatalogExecutionId) {
                                resolve({card, skipped: false});
                             } else {
                                 console.log(`(ID: ${executionId}) Fade-out transitionend skipped for ${card.id} (stale execution)`);
                                 resolve({card, skipped: true});
                             }
                        }
                    }, { once: true });
                } else {
                    resolve({card, skipped: false}); // Already hidden
                }
            });
        });

        // 3. Start fade-in for cards to be added/revealed
        cardsToFadeIn.forEach(card => {
             if (executionId !== currentLoadCatalogExecutionId) return; // Check before rAF
            requestAnimationFrame(() => {
                 if (executionId !== currentLoadCatalogExecutionId) return; // Check inside rAF
                requestAnimationFrame(() => {
                    if (executionId !== currentLoadCatalogExecutionId) return; // Check inside nested rAF

                     const latestFilteredIds = new Set((selectedTag === null ? catalog : catalog.filter(i => i.tags.includes(selectedTag))).map(i => i.id));
                     // Ensure card exists and should be revealed in this execution context
                     if (document.body.contains(card) && latestFilteredIds.has(card.id) && card.classList.contains('hidden')) {
                         card.classList.remove('hidden');
                         console.log(`(ID: ${executionId}) Revealed card ${card.id} via rAF`);
                     }
                });
            });
        });


        // --- FLIP: Last, Invert & Play (Triggered AFTER fade-outs complete for THIS execution) ---
        Promise.all(fadeOutPromises).then((results) => {
             // IMPORTANT: Check if this execution is still the latest one
             if (executionId !== currentLoadCatalogExecutionId) {
                 console.log(`(ID: ${executionId}) Skipping FLIP trigger (stale execution)`);
                 return;
             }

            const cardsToRemove = results.filter(r => !r.skipped).map(r => r.card);
            console.log(`(ID: ${executionId}) All ${cardsToRemove.length} relevant fade-outs complete. Removing elements.`);

            // Remove the faded-out cards from DOM
            cardsToRemove.forEach(card => {
                const latestFilteredIds = new Set((selectedTag === null ? catalog : catalog.filter(i => i.tags.includes(selectedTag))).map(i => i.id));
                if (document.body.contains(card) && !latestFilteredIds.has(card.id)) {
                    console.log(`(ID: ${executionId}) Removing ${card.id} from DOM.`);
                    card.remove();
                } else {
                    console.log(`(ID: ${executionId}) Skipping DOM removal for ${card.id} (back in filter or already removed).`);
                }
            });

            syncCupWithPlacedCard();

            // Animate remaining cards
            requestAnimationFrame(() => { // Ensure layout updated after removal
                if (executionId !== currentLoadCatalogExecutionId) return; // Check again

                const cardsToActuallyAnimate = [];
                cardsToRemainVisible.forEach(card => {
                    const initialRect = initialPositions.get(card.id);
                    if (!document.body.contains(card) || card.classList.contains('hidden') || !initialRect) return;

                    const finalRect = card.getBoundingClientRect();
                    const deltaX = initialRect.left - finalRect.left;
                    const deltaY = initialRect.top - finalRect.top;

                    if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                        card.style.transition = 'none';
                        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                        cardsToActuallyAnimate.push(card);
                    } else {
                        card.style.transform = ''; card.style.transition = ''; card.classList.remove('flipping');
                    }
                });

                if (cardsToActuallyAnimate.length > 0) {
                     console.log(`(ID: ${executionId}) FLIP Triggering: Animating ${cardsToActuallyAnimate.length} cards.`);
                    catalogContainer.offsetHeight; // Force Reflow

                    requestAnimationFrame(() => { // Play in next frame
                        if (executionId !== currentLoadCatalogExecutionId) return; // Check again

                        cardsToActuallyAnimate.forEach(card => {
                            if (!document.body.contains(card)) return;
                            card.style.transition = '';
                            card.classList.add('flipping');
                            card.style.transform = '';

                            card.addEventListener('transitionend', function cleanup(event) {
                                // Check execution ID HERE too!
                                if (event.propertyName === 'transform' && card.classList.contains('flipping') && executionId === currentLoadCatalogExecutionId) {
                                    console.log(`(ID: ${executionId}) FLIP Cleanup: Card ${card.id}`);
                                    card.classList.remove('flipping');
                                    syncCupWithPlacedCard();
                                } else if (executionId !== currentLoadCatalogExecutionId) {
                                     console.log(`(ID: ${executionId}) Stale FLIP cleanup listener ignored for card ${card.id}`);
                                }
                            }, { once: true });
                        });
                    });
                } else {
                    console.log(`(ID: ${executionId}) FLIP: No cards needed position animation after removals.`);
                }

                syncCupWithPlacedCard();
            });

        }).catch(error => {
            // Check execution ID in catch block as well
            if (executionId === currentLoadCatalogExecutionId) {
                 console.error(`(ID: ${executionId}) Error waiting for fade-out transitions:`, error);
            } else {
                 console.log(`(ID: ${executionId}) Stale Promise rejection ignored.`);
            }
        });


        // --- Handle Empty State ---
        // Check executionId before setting timeout
        if (executionId === currentLoadCatalogExecutionId) {
             setTimeout(() => {
                // Check executionId again inside timeout
                if (executionId !== currentLoadCatalogExecutionId) return;

                 const existingMessage = catalogContainer.querySelector('.empty-catalog-message');
                 if (existingMessage) existingMessage.remove();
                 const currentVisibleCards = catalogContainer.querySelectorAll('.player-card:not(.hidden)');
                 if (currentVisibleCards.length === 0 && !catalogContainer.querySelector('.empty-catalog-message')) {
                     const message = selectedTag === null ? 'カタログは空です。' : `タグ「${selectedTag}」に一致する動画はありません。`;
                     const p = document.createElement('p');
                     p.style.textAlign = 'center'; p.style.width = '100%'; p.style.color = '#999';
                     p.className = 'empty-catalog-message'; p.textContent = message;
                     catalogContainer.appendChild(p);
                 }
             }, 800);
        }

        console.log(`(ID: ${executionId}) Catalog UI update process initiated.`);

        // --- Re-apply Playing State Visuals ---
         // This part doesn't involve async operations that depend on the executionId in the same way,
         // so it might be okay without the check, but adding it won't hurt.
         if (executionId === currentLoadCatalogExecutionId) {
             if (currentPlayerCardId) {
                 // ... (rest of the playing state logic)
                const currentCardElement = document.getElementById(currentPlayerCardId);
                if (currentCardElement && !currentCardElement.classList.contains('hidden')) {
                    if (isPlaying) {
                        activateCard(currentPlayerCardId);
                        if (largeDiscContainer && !isDraggingDisc) largeDiscContainer.classList.add('playing');
                    } else {
                        deactivateCard(currentPlayerCardId);
                        if (largeDiscContainer) largeDiscContainer.classList.remove('playing');
                    }
                } else {
                     console.log("(Playing card is not currently visible in the filter.)"); // Removed ID for brevity
                     if (largeDiscContainer) {
                         if (!isPlaying) largeDiscContainer.classList.remove('playing');
                         else largeDiscContainer.classList.add('playing');
                     }
                }
             } else {
                  if (largeDiscContainer) largeDiscContainer.classList.remove('playing');
             }
         }
    }

    // Update large disc info (recreate if deleted)
    function updateLargeDiscInfo(trackData) {
        if (!largeDiscContainer) {
            console.error("Required elements for updating large disc info missing (container).");
            return;
        }

        // #large-disc-label（黒い円）がなければ作成
        const largeDisc = largeDiscContainer.querySelector('#large-disc');
        if (largeDisc && !largeDisc.querySelector('#large-disc-label')) {
            const label = document.createElement('div');
            label.id = 'large-disc-label';
            largeDisc.appendChild(label);
        }

        // #large-disc-label2（ラベル前面の円）がなければ作成
        if (largeDisc && !largeDisc.querySelector('#large-disc-label2')) {
            const label2 = document.createElement('div');
            label2.id = 'large-disc-label2';
            largeDisc.appendChild(label2);
        }

        // #large-thumbnail-wrapperがなければ作成
        let wrapper = largeDiscContainer.querySelector('#large-thumbnail-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'large-thumbnail-wrapper';
            let img = largeDiscContainer.querySelector('#large-thumbnail');
            if (!img) {
                img = document.createElement('img');
                img.id = 'large-thumbnail';
            }
            wrapper.appendChild(img);
            if (largeDisc) {
                const oldImg = largeDisc.querySelector('#large-thumbnail');
                if (oldImg) oldImg.remove();
                largeDisc.appendChild(wrapper);
            }
        }

        // #large-disc-center-hole（センター穴）がなければ作成
        if (largeDisc && !largeDisc.querySelector('#large-disc-center-hole')) {
            const hole = document.createElement('div');
            hole.id = 'large-disc-center-hole';
            largeDisc.appendChild(hole);
        }

        // サムネイル画像のsrc/altを更新
        const largeThumbnail = wrapper.querySelector('#large-thumbnail');
        if (largeThumbnail) {
            largeThumbnail.src = `https://img.youtube.com/vi/${trackData.videoId}/hqdefault.jpg`;
            largeThumbnail.alt = trackData.title || 'Currently Playing';
            largeThumbnail.onerror = function() { this.src = 'placeholder.png'; };
        }

        if (currentTrackTitleDiv) {
            currentTrackTitleDiv.textContent = trackData.title || 'タイトル不明';
        }
        if (currentTrackArtistDiv) {
            currentTrackArtistDiv.textContent = trackData.artist || 'アーティスト不明';
        }
        if (currentTrackGenreDiv) {
            currentTrackGenreDiv.textContent = trackData.tags && trackData.tags.length > 0 
                ? `#${trackData.tags.join(' #')}` 
                : '';
        }

        const currentTrackInfo = document.getElementById('current-track-info');
        if (currentTrackInfo) {
            currentTrackInfo.classList.remove('visible');
        }

        console.log(`Large disc info updated for: ${trackData.title || trackData.videoId}`);
    }

    console.log("Script execution finished. Waiting for DOMContentLoaded and YouTube API callback...");

    // --- Seek Bar Functions ---
    function addSeekBarListeners() {
        if (seekBar) {
            // Use 'input' for live updates while dragging
            seekBar.addEventListener('input', handleSeekBarInput);
            // Use 'change' for final value if needed (optional)
            // seekBar.addEventListener('change', handleSeekBarChange);
        }
    }

    function handleSeekBarInput(event) {
        if (!playerReady || !player || typeof player.seekTo !== 'function') return;

        const duration = player.getDuration();
        if (!duration) return;

        const newTime = event.target.value;
        
        // 再生中かどうかを確認
        const wasPlaying = player.getPlayerState() === YT.PlayerState.PLAYING;
        
        // 常に再生状態を維持
        if (!wasPlaying) {
            // 一時停止中だった場合は再生を開始
            player.playVideo();
        }
        
        // 即座にシーク位置を更新
        player.seekTo(newTime, true); // 二番目の引数をtrueに変更して、すぐにシーク位置に移動
        
        // UI更新
        updateSeekBarUI(newTime, duration);

        // シークバー更新間隔の管理
        if (seekBarUpdateInterval) {
            clearInterval(seekBarUpdateInterval);
            seekBarUpdateInterval = null;
            // 更新を再開
            setTimeout(startSeekBarUpdates, 200);
        }
    }

    function startSeekBarUpdates() {
        if (seekBarUpdateInterval) return; // Already running
        if (!playerReady || !player || !isPlaying) return; // Only run when playing

        seekBarUpdateInterval = setInterval(() => {
            updateSeekBarUI();
        }, 500); // Update interval (e.g., twice per second)
         // Initial update
         updateSeekBarUI();
    }

    function updateSeekBarUI(currentTime = null, duration = null) {
        if (!playerReady || !player || !seekBar) return;
    
        try {
            // Get current time and duration if not provided
            const current = currentTime ?? player.getCurrentTime();
            const total = duration ?? player.getDuration();
    
            if (isNaN(current) || isNaN(total) || total <= 0) {
                // Reset UI if duration is invalid or zero
                seekBar.value = 0;
                seekBar.max = 100; // Default max
                return;
            }
    
            // Update seek bar value and max
            seekBar.value = current;
            seekBar.max = total;
    
            // Calculate the percentage of the current time
            const seekPercentage = (current / total) * 100;
            seekBar.style.setProperty('--seek-percentage', `${seekPercentage}%`); // Update the CSS variable
    
        } catch (error) {
            console.error("Error updating seek bar UI:", error);
            // Reset UI on error
            seekBar.value = 0;
            seekBar.max = 100;
        }
    }

    // Helper function to format time in M:SS
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) {
            return "0:00";
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // --- Custom Volume Slider Functions --- ★ NEW SECTION
    function addCustomVolumeSliderListeners() {
        if (!volumeTrack || !volumeThumb || !volumeSliderContainer) return;

        // Listener for starting drag (on track or thumb)
        const startDrag = (event) => {
            isDraggingVolume = true;
            volumeThumb.style.cursor = 'grabbing'; // Change cursor
            volumeThumb.classList.add('dragging'); // ★ ドラッグ開始時にクラスを追加
            document.body.style.cursor = 'grabbing'; // Prevent text selection cursor
            document.body.style.userSelect = 'none';
            updateVolumeFromEvent(event);

            // Add move and end listeners to the document
            document.addEventListener('mousemove', handleVolumeDragMove);
            document.addEventListener('mouseup', handleVolumeDragEnd);
            document.addEventListener('touchmove', handleVolumeDragMove, { passive: false });
            document.addEventListener('touchend', handleVolumeDragEnd);
            document.addEventListener('touchcancel', handleVolumeDragEnd);
        };

        // Add listeners to both container and thumb for easier interaction start
        volumeTrack.addEventListener('mousedown', startDrag);
        volumeTrack.addEventListener('touchstart', startDrag, { passive: false });
        volumeThumb.addEventListener('mousedown', startDrag);
        volumeThumb.addEventListener('touchstart', startDrag, { passive: false });
        
        // ボリュームアイコンを取得
        const volumeIconTop = document.querySelector('.volume-icon.top');
        const volumeIconBottom = document.querySelector('.volume-icon.bottom');
        
        // 上部アイコン（音量増加）クリック時
        volumeIconTop.addEventListener('click', function(event) {
            // クリックイベントの伝播を停止
            event.preventDefault();
            event.stopPropagation();
            
            // 現在のボリュームから10%増加（最大100）
            // currentVolumeValueを使わずに、現在の実際のプレーヤーの音量値を使用
            const currentVolume = player ? player.getVolume() : 50;
            const newVolume = Math.min(100, currentVolume + 10);
            
            // 音量を設定
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(newVolume);
                // UIを更新
                updateVolumeSliderUI(newVolume);
                // グローバル変数も更新
                currentVolumeValue = newVolume;
                console.log("Volume increased to: " + newVolume);
            }
        });
        
        // 下部アイコン（音量減少）クリック時
        volumeIconBottom.addEventListener('click', function(event) {
            // クリックイベントの伝播を停止
            event.preventDefault();
            event.stopPropagation();
            
            // 現在のボリュームから10%減少（最小0）
            // currentVolumeValueを使わずに、現在の実際のプレーヤーの音量値を使用
            const currentVolume = player ? player.getVolume() : 50;
            const newVolume = Math.max(0, currentVolume - 10);
            
            // 音量を設定
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(newVolume);
                // UIを更新
                updateVolumeSliderUI(newVolume);
                // グローバル変数も更新
                currentVolumeValue = newVolume;
                console.log("Volume decreased to: " + newVolume);
            }
        });

        console.log("Custom volume slider listeners added.");
    }

    function handleVolumeDragMove(event) {
        if (!isDraggingVolume) return;
        event.preventDefault(); // Prevent scrolling on touch devices
        updateVolumeFromEvent(event);
    }

    function handleVolumeDragEnd(event) {
        if (!isDraggingVolume) return;
        isDraggingVolume = false;
        volumeThumb.style.cursor = 'grab'; // Restore cursor
        volumeThumb.classList.remove('dragging'); // ★ ドラッグ終了時にクラスを削除
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Remove move and end listeners from the document
        document.removeEventListener('mousemove', handleVolumeDragMove);
        document.removeEventListener('mouseup', handleVolumeDragEnd);
        document.removeEventListener('touchmove', handleVolumeDragMove);
        document.removeEventListener('touchend', handleVolumeDragEnd);
        document.removeEventListener('touchcancel', handleVolumeDragEnd);
        console.log("Volume drag ended.");
    }

    function updateVolumeFromEvent(event) {
        if (!volumeTrack || !volumeThumb || !playerReady || !player) return;

        const trackRect = volumeTrack.getBoundingClientRect();
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        const padding = 10; // パディングをstyle.cssの設定と一致させる (10px)

        // トラックの有効な高さを計算
        const effectiveHeight = Math.max(1, trackRect.height - padding * 2);

        // トラック内での相対的なY座標を計算 (上端が0)
        let relativeYInTrack = clientY - trackRect.top;

        // パディングを考慮してY座標をクランプ
        let clampedY = Math.max(padding, Math.min(trackRect.height - padding, relativeYInTrack));

        // パディング領域内での相対的な位置 (0.0 ~ 1.0) を計算 (上が0, 下が1)
        const positionInPaddedArea = (clampedY - padding) / effectiveHeight;

        // 音量を計算 (0-100, 下が0%, 上が100%)
        const volume = Math.round((1.0 - positionInPaddedArea) * 100);

        try {
            // グローバル変数を更新
            currentVolumeValue = volume;
            
            if (player && typeof player.setVolume === 'function') {
                 player.setVolume(volume);
            } else {
                console.warn("Player or setVolume not available");
            }
            updateVolumeSliderUI(volume);
            // console.log(`Volume updated to: ${volume}`); // Optional log
        } catch (error) {
            console.error("Error setting volume or updating UI:", error);
        }
    }

    // Modify this function to update custom slider UI
    function updateVolumeSliderUI(volume) {
        if (!volumeTrack || !volumeThumb) return;
        
        // トラックの背景を更新
        volumeTrack.style.setProperty('--volume-percentage', `${volume}%`);
        
        // 端の位置を微調整（100%と0%の時に少し内側に）
        let adjustedVolume = volume;
        
        // 端の値の場合に少し内側に調整
        if (volume === 0) {
            adjustedVolume = 2; // 0%の場合は2%位置に
        } else if (volume === 100) {
            adjustedVolume = 98; // 100%の場合は98%位置に
        }
        
        // 位置を計算（0%が下、100%が上）
        const positionPercent = 100 - adjustedVolume;
        
        // サムの位置を設定
        volumeThumb.style.top = `${positionPercent}%`;
    }

    // Add initialization call after DOM is ready
    // Make sure initializeDOMElements is called first if it modifies the body/adds elements
    document.addEventListener('DOMContentLoaded', () => {
        // Ensure other initializations run first if they exist and are needed
        if (typeof initializeDOMElements === 'function') {
             // Assuming initializeDOMElements is already called by another DOMContentLoaded listener
             // If not, call it here: initializeDOMElements();
        }
        // Initialize the spark effect
        initializeClickSpark();
    });

    // --- Utility ---
    function displayGlobalError(message) {
        if (catalogContainer) {
             // Use a dedicated div for global errors if available
             const errorDiv = document.getElementById('global-error-message');
             if (errorDiv) {
                 errorDiv.textContent = message;
                 errorDiv.style.display = 'block'; // Make it visible
                 console.error("Global Error Displayed:", message); // Log the error
                 // Clear catalog container to prevent confusion
                 catalogContainer.innerHTML = '';
             } else {
                 // Fallback: Display in catalog container
                 catalogContainer.innerHTML = `<p style="color: red; text-align:center; padding: 20px; font-weight: bold;">${message}</p>`;
             }
        } else {
             console.error("Cannot display global error, container not found.");
             // Fallback alert (use sparingly)
             // alert(`ERROR: ${message}`);
        }
    }

    // Function to display tag filter buttons
    function displayTagFilters() {
        if (!tagFilterContainer) return;
        tagFilterContainer.innerHTML = ''; // Clear existing buttons

        const sortedTags = Array.from(allTags).sort();
        sortedTags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-button';
            button.dataset.tag = tag;
            button.textContent = tag;
            button.addEventListener('click', handleTagClick); // Use the correct handler
            tagFilterContainer.appendChild(button);
        });

        console.log("Tag filters displayed.");
    }

    // Function to handle tag button clicks
    function handleTagClick(event) {
        const clickedButton = event.target;
        const clickedTag = clickedButton.dataset.tag;

        if (selectedTag === clickedTag) {
            // Deselect the tag
            selectedTag = null;
            document.querySelectorAll('#tag-filter-container .tag-button').forEach(btn => {
                btn.classList.remove('active');
            });
            console.log("Tag deselected.");
        } else {
            // Select the new tag
            selectedTag = clickedTag;
            document.querySelectorAll('#tag-filter-container .tag-button').forEach(btn => {
                btn.classList.toggle('active', btn === clickedButton);
            });
            console.log(`Selected tag: ${selectedTag}`);
        }

        loadCatalog(); // Reload catalog based on the new selection
    }

    // 再生モードリスナーを追加する関数
    function addPlaybackModeListeners() {
        if (!sequentialPlaybackBtn || !randomPlaybackBtn) {
            console.error("Playback mode buttons not found!");
            return;
        }

        // 連続再生ボタンのクリックイベント
        sequentialPlaybackBtn.addEventListener('click', function() {
            playbackMode = PLAYBACK_MODE.SEQUENTIAL;
            sequentialPlaybackBtn.classList.add('active');
            randomPlaybackBtn.classList.remove('active');
            console.log("再生モードを連続再生に変更しました");
        });

        // ランダム再生ボタンのクリックイベント
        randomPlaybackBtn.addEventListener('click', function() {
            playbackMode = PLAYBACK_MODE.RANDOM;
            randomPlaybackBtn.classList.add('active');
            sequentialPlaybackBtn.classList.remove('active');
            console.log("再生モードをランダム再生に変更しました");
        });

        console.log("Playback mode listeners added.");
    }

    // 次の曲を再生する関数
    function playNextTrack() {
        if (!playerReady || !player || !currentPlayerCardId) {
            console.warn("Cannot play next track: player not ready or no current track");
            return;
        }

        // フィルタリングされた現在のカタログを取得
        const filteredCatalog = selectedTag === null
            ? catalog
            : catalog.filter(item => item.tags.includes(selectedTag));

        if (filteredCatalog.length <= 1) {
            console.log("カタログに次の曲がありません");
            // 1曲しかない場合は停止
            if (currentTrackInfoDiv) currentTrackInfoDiv.classList.remove('visible');
            if (seekBarContainer) seekBarContainer.classList.remove('visible');
            if (playbackControlContainer) playbackControlContainer.classList.remove('visible');
            hideBottomPlayer();
            return;
        }

        let nextItem;

        // 再生モードに応じて次の曲を決定
        if (playbackMode === PLAYBACK_MODE.SEQUENTIAL) {
            // 連続再生: 現在の曲の次の曲を再生
            const currentIndex = filteredCatalog.findIndex(item => item.id === currentPlayerCardId);
            if (currentIndex === -1) {
                console.warn("Current track not found in filtered catalog");
                return;
            }
            
            // 次の曲のインデックスを計算（最後の曲なら最初に戻る）
            const nextIndex = (currentIndex + 1) % filteredCatalog.length;
            nextItem = filteredCatalog[nextIndex];
            console.log(`連続再生: 次の曲 ${nextIndex + 1}/${filteredCatalog.length}`, nextItem.title);
            
        } else {
            // ランダム再生: 現在の曲以外からランダムに選択
            const availableTracks = filteredCatalog.filter(item => item.id !== currentPlayerCardId);
            const randomIndex = Math.floor(Math.random() * availableTracks.length);
            nextItem = availableTracks[randomIndex];
            console.log(`ランダム再生: 次の曲`, nextItem.title);
        }

        // 次の曲を再生
        if (nextItem) {
            console.log("次の曲を再生します:", nextItem.title);
            handleCardClick(nextItem);
        }
    }

})(); // End of IIFE