(function() {
    const GAME_VERSION = "3.0.0";
    const SAVE_KEY_PRIMARY = 'trader_real_save_v5';
    const SAVE_KEY_BACKUP = 'trader_real_save_backup_v5';
    const MONTH_DURATION_SECONDS = 600; // الشهر = 10 دقائق
    const WAREHOUSE_EXPAND_COST = 50000; 
    const SECRET_SALT = "DMT_REAL_TRADER_SECURE_SALT_PRO_V3";

    // ==========================================
    // 🔊 نظام المؤثرات الصوتية (Web Audio API)
    // ==========================================
    const AudioEngine = {
        ctx: null,
        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
        },
        playMoneySound() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, now); // B5
            osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        },
        playTruckSound() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
        },
        playAlertSound() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    };

    const baseProductPrices = {
        dairy: 18,
        cleaners: 40,
        frozen: 120,
        bakery: 25,
        dryfood: 30,
        cosmetics: 85
    };

    const productNames = {
        dairy: 'ألبان', cleaners: 'منظفات', frozen: 'مجمدات',
        bakery: 'مخبوزات', dryfood: 'مواد غذائية', cosmetics: 'مستحضرات تجميل'
    };

    // 🚚 الموردين المتعددين لكل منتج: اقتصادي (رخيص وبطيء) / قياسي / فوري (غالي وسريع)
    const supplierProfiles = [
        { id: 'budget', name: 'مورد اقتصادي', icon: '🐢', priceMult: 0.82, arrivalDelay: 45, riskPercent: 0.15 },
        { id: 'standard', name: 'مورد قياسي', icon: '🚚', priceMult: 1.0, arrivalDelay: 15, riskPercent: 0.05 },
        { id: 'express', name: 'مورد فوري (إكسبرس)', icon: '⚡', priceMult: 1.3, arrivalDelay: 0, riskPercent: 0.0 }
    ];

    // نسب تلف المخزون الراكد شهرياً حسب طبيعة المنتج (منتجات سريعة التلف مقابل دائمة)
    const spoilRates = { dairy: 0.08, frozen: 0.10, bakery: 0.09, dryfood: 0.03, cleaners: 0, cosmetics: 0.01 };

    const governoratesData = [
        { id: 'domyat', name: 'دمياط (المقر الرئيسي)', minLvl: 1, cost: 0, unlocked: true, bonus: 0, deliveryTime: 10, hasBranch: true, branchCost: 0 },
        { id: 'dakahlia', name: 'الدقهلية (المنصورة)', minLvl: 2, cost: 120000, unlocked: false, bonus: 0.20, deliveryTime: 15, hasBranch: false, branchCost: 40000 },
        { id: 'sharqia', name: 'الشرقية (الزقازيق)', minLvl: 3, cost: 250000, unlocked: false, bonus: 0.20, deliveryTime: 20, hasBranch: false, branchCost: 70000 },
        { id: 'cairo', name: 'القاهرة الكبرى', minLvl: 4, cost: 500000, unlocked: false, bonus: 0.30, deliveryTime: 30, hasBranch: false, branchCost: 120000 },
        { id: 'alex', name: 'الإسكندرية', minLvl: 5, cost: 800000, unlocked: false, bonus: 0.35, deliveryTime: 35, hasBranch: false, branchCost: 160000 }
    ];

    const defaultGameState = {
        version: GAME_VERSION,
        playerName: 'تاجر جديد',
        level: 1,
        money: 500000,
        loan: 0,
        month: 1,
        monthProgressTimer: 0,
        marketingLevel: 0,
        marketingMultiplier: 1,
        office: { owned: false, level: 1 },
        warehouse: { 
            owned: false, 
            level: 1, 
            capacity: 0, 
            hasCoolingSystem: false,
            hasAutoLoader: false,
            stock: { dairy: 0, cleaners: 0, frozen: 0, bakery: 0, dryfood: 0, cosmetics: 0 } 
        },
        marketPrices: { ...baseProductPrices },
        trucks: 0,
        refrigeratedTrucks: 0,
        activeDeliveries: [],
        staff: { drivers: 0, reps: [] },
        signedContracts: { dairy: false, cleaners: false, frozen: false, bakery: false, dryfood: false, cosmetics: false },
        governorates: governoratesData,
        marketDeals: [],
        currentTab: 'admin',
        totalRevenueGenerated: 0,
        lastSavedTime: Date.now(),
        vipClients: {},
        activeSeason: null,
        monthlyQuest: null,
        achievements: {
            firstMillion: false,
            fleetOwner: false,
            allGovs: false,
            techMaster: false,
            globalTrader: false
        },
        aiCompetitor: {
            name: "شركة النصر للتوزيع",
            share: 15,
            isAcquired: false,
            takeoverCost: 3000000
        },
        // الميزات الجديدة:
        techTree: {
            app: false,       // تطبيق موبايل
            gps: false,       // GPS للشاحنات
            security: false   // شركة أمن وحراسة
        },
        investments: {
            dairyShares: 0,   // أسهم مصنع الألبان (سعر السهم 50,000)
            logisticsShares: 0 // أسهم شركة اللوجستيات (سعر السهم 100,000)
        },
        insuranceActive: false,
        taxDue: 0,
        revenueHistory: [], // سجل إجمالي المبيعات آخر 12 شهر لرسم بياني النمو
        // ============ الميزات الجديدة (كسر الرتابة) ============
        incomingShipments: [], // شحنات واردة من الموردين لسه في الطريق للمخزن
        autoReorder: {
            dairy: { enabled: false }, cleaners: { enabled: false }, frozen: { enabled: false },
            bakery: { enabled: false }, dryfood: { enabled: false }, cosmetics: { enabled: false }
        },
        dealsSortMode: 'default', // default | revenue | expiry
        regionalDemand: {}, // المنتج المطلوب بقوة في كل محافظة هذا الشهر
        clientContracts: [], // عقود عملاء طويلة المدى نشطة
        contractOffers: [],  // عروض عقود جديدة متاحة للتوقيع
        exportDealsCompleted: 0, // عدد صفقات التصدير الدولي المكتملة

        // ============ اقتراحات كسر الملل الجديدة ============
        reputation: 70, // سمعة الشركة (0-100): تؤثر فعلياً على قيمة وعدد الصفقات
        lastStoryEventId: null, // آخر حدث قصصي ظهر (لتفادي التكرار المباشر)
        economicCycle: { type: 'normal', monthsRemaining: 0 }, // دورة اقتصادية: normal / boom / recession
        prestigeLevel: 0, // عدد مرات بدء إمبراطورية جديدة (Prestige)
        prestigeBonus: 0, // نسبة البونص الدائم على كل الأرباح (%)
        monthStats: { dealsCompleted: 0, revenueByProduct: {} } // إحصائيات الشهر الحالي لعرضها بملخص نهاية الشهر
    };

    let gameState = JSON.parse(JSON.stringify(defaultGameState));
    const clientNames = ["سوبرماركت التقوى", "هايبر الأمل", "أسواق مكة", "ماركت الأمانة", "سلسلة الجملة", "ميني ماركت البركة", "أسواق المدينة", "هايبر الفيروز", "ماركت النور", "أسواق الهدى"];
    const exportClientNames = ["مستورد من الإمارات 🇦🇪", "شركة استيراد سعودية 🇸🇦", "تاجر جملة ليبي 🇱🇾", "موزع أردني 🇯🇴", "شركة تصدير قطرية 🇶🇦"];

    // خوارزمية التشفير والحماية ضد التلاعب
    async function generateChecksum(dataObj) {
        const clone = JSON.parse(JSON.stringify(dataObj));
        delete clone.checksum;
        const str = JSON.stringify(clone) + SECRET_SALT;
        const msgUint8 = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function saveGameData(isManual = false) {
        try {
            gameState.lastSavedTime = Date.now();
            gameState.checksum = await generateChecksum(gameState);
            const dataStr = JSON.stringify(gameState);
            localStorage.setItem(SAVE_KEY_PRIMARY, dataStr);
            localStorage.setItem(SAVE_KEY_BACKUP, dataStr);
            if(isManual) showToast("تم حفظ جميع بيانات اللعبة بنجاح وحمايتها!", "success");
        } catch(e) { console.error(e); }
    }

    // يوحّد بيانات أي حفظة قديمة (تصدير/استيراد كود أو localStorage) مع أي حقول جديدة أُضيفت لاحقاً
    function normalizeGameState() {
        if (!gameState.marketPrices) gameState.marketPrices = { ...baseProductPrices };
        if (!gameState.vipClients) gameState.vipClients = {};
        if (!gameState.achievements) gameState.achievements = { firstMillion: false, fleetOwner: false, allGovs: false, techMaster: false, globalTrader: false };
        if (!gameState.techTree) gameState.techTree = { app: false, gps: false, security: false };
        if (!gameState.investments) gameState.investments = { dairyShares: 0, logisticsShares: 0 };
        if (!Array.isArray(gameState.revenueHistory)) gameState.revenueHistory = [];
        if (!Array.isArray(gameState.incomingShipments)) gameState.incomingShipments = [];
        if (!gameState.autoReorder) gameState.autoReorder = JSON.parse(JSON.stringify(defaultGameState.autoReorder));
        if (!gameState.dealsSortMode) gameState.dealsSortMode = 'default';
        if (!gameState.regionalDemand) gameState.regionalDemand = {};
        if (!Array.isArray(gameState.clientContracts)) gameState.clientContracts = [];
        if (!Array.isArray(gameState.contractOffers)) gameState.contractOffers = [];
        if (gameState.exportDealsCompleted === undefined) gameState.exportDealsCompleted = 0;
        if (gameState.achievements && gameState.achievements.globalTrader === undefined) gameState.achievements.globalTrader = false;

        // تطبيع الميزات الجديدة (سمعة/دورة اقتصادية/Prestige/مخازن فرعية/إحصائيات شهرية)
        if (gameState.reputation === undefined) gameState.reputation = 70;
        if (gameState.lastStoryEventId === undefined) gameState.lastStoryEventId = null;
        if (!gameState.economicCycle) gameState.economicCycle = { type: 'normal', monthsRemaining: 0 };
        if (gameState.prestigeLevel === undefined) gameState.prestigeLevel = 0;
        if (gameState.prestigeBonus === undefined) gameState.prestigeBonus = 0;
        if (!gameState.monthStats) gameState.monthStats = { dealsCompleted: 0, revenueByProduct: {} };
        const branchCostMap = { domyat: 0, dakahlia: 40000, sharqia: 70000, cairo: 120000, alex: 160000 };
        if (Array.isArray(gameState.governorates)) {
            gameState.governorates.forEach(g => {
                if (g.hasBranch === undefined) g.hasBranch = (g.id === 'domyat');
                if (g.branchCost === undefined) g.branchCost = branchCostMap[g.id] !== undefined ? branchCostMap[g.id] : 50000;
            });
        }
        if (Array.isArray(gameState.staff && gameState.staff.reps)) {
            gameState.staff.reps.forEach(r => { if (r.monthSales === undefined) r.monthSales = 0; });
        }
    }

    // ==========================================
    // 🏠 شاشة البداية: متابعة / لعبة جديدة / إعدادات / دليل
    // ==========================================

    // يحدّث حالة أزرار شاشة البداية حسب وجود حفظة صالحة من عدمه (بدون تحميلها فعلياً أو التحقق من التوقيع)
    function refreshStartScreenState() {
        const dataStr = localStorage.getItem(SAVE_KEY_PRIMARY) || localStorage.getItem(SAVE_KEY_BACKUP);
        const continueBtn = document.getElementById('btn-continue-game');
        const continueInfo = document.getElementById('continue-game-info');
        const exportBtn = document.getElementById('start-export-btn');
        const resetBtn = document.getElementById('start-reset-btn');
        let hasSave = false;

        if (dataStr) {
            try {
                const parsed = JSON.parse(dataStr);
                if (parsed && parsed.playerName) {
                    hasSave = true;
                    if (continueInfo) {
                        continueInfo.style.display = 'block';
                        continueInfo.innerText = `${parsed.playerName} • Level ${parsed.level || 1} • ${(parsed.money || 0).toLocaleString()} ج.م • شهر ${parsed.month || 1}`;
                    }
                }
            } catch (e) { hasSave = false; }
        }

        if (continueBtn) continueBtn.disabled = !hasSave;
        if (!hasSave && continueInfo) continueInfo.style.display = 'none';
        if (exportBtn) exportBtn.disabled = !hasSave;
        if (resetBtn) resetBtn.disabled = !hasSave;
    }

    // ▶️ متابعة اللعبة المحفوظة (يتحقق من التوقيع الرقمي فعلياً هنا)
    window.continueGame = async function() {
        const ok = await loadGameData(false);
        if (ok) {
            document.getElementById('start-screen').classList.add('hidden');
        } else {
            showToast("لا توجد حفظة صالحة لمتابعتها، جرب بدء لعبة جديدة أو استرجاع كود حماية.", "error");
            refreshStartScreenState();
        }
    };

    // 🆕 بدء لعبة جديدة (يحذّر أولاً لو فيه تقدم محفوظ بالفعل)
    window.startNewGame = function() {
        const dataStr = localStorage.getItem(SAVE_KEY_PRIMARY) || localStorage.getItem(SAVE_KEY_BACKUP);
        if (dataStr) {
            document.getElementById('new-game-confirm-modal').classList.remove('hidden');
        } else {
            document.getElementById('start-screen').classList.add('hidden');
            document.getElementById('name-modal').classList.remove('hidden');
            document.getElementById('player-name-input').focus();
        }
    };

    window.confirmStartNewGame = function() {
        localStorage.removeItem(SAVE_KEY_PRIMARY);
        localStorage.removeItem(SAVE_KEY_BACKUP);
        gameState = JSON.parse(JSON.stringify(defaultGameState));
        closeModal('new-game-confirm-modal');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('name-modal').classList.remove('hidden');
        document.getElementById('player-name-input').value = "";
        document.getElementById('player-name-input').focus();
    };

    window.openStartSettingsModal = function() {
        refreshStartScreenState();
        document.getElementById('start-settings-modal').classList.remove('hidden');
    };

    // 📖 لوحة دليل اللعبة الجانبية
    window.openGuidePanel = function() { document.getElementById('guide-overlay').classList.remove('hidden'); };
    window.closeGuidePanel = function() { document.getElementById('guide-overlay').classList.add('hidden'); };
    window.closeGuidePanelBackdrop = function(evt) { if (evt.target.id === 'guide-overlay') closeGuidePanel(); };

    async function loadGameData(isManual = false) {
        try {
            let dataStr = localStorage.getItem(SAVE_KEY_PRIMARY) || localStorage.getItem(SAVE_KEY_BACKUP);
            if(dataStr) {
                const loaded = JSON.parse(dataStr);
                const savedChecksum = loaded.checksum;
                const calculatedChecksum = await generateChecksum(loaded);

                if (savedChecksum && savedChecksum !== calculatedChecksum) {
                    showToast("⚠️ كشف النظام تلاعباً في ملف الحفظ! تم إعادة ضبط اللعبة لحمايتها.", "error");
                    executeGameReset();
                    return false;
                }

                gameState = Object.assign({}, JSON.parse(JSON.stringify(defaultGameState)), loaded);
                normalizeGameState();
                
                document.getElementById('dashboard-screen').classList.remove('hidden');
                updateUI();
                showTab(gameState.currentTab || 'admin');
                if(isManual) showToast("تم استرجاع تقدمك الموثوق بنجاح!", "success");
                return true;
            }
        } catch(e) { console.error("خطأ بالتحميل", e); }
        return false;
    }

    window.addEventListener('DOMContentLoaded', () => {
        refreshStartScreenState();
    });

    window.addEventListener('beforeunload', () => {
        // نحفظ فقط لو فيه جلسة لعب فعلية شغالة (الداشبورد ظاهر)، لتفادي الكتابة فوق حفظة حقيقية ببيانات فارغة
        const dashboardVisible = document.getElementById('dashboard-screen') && !document.getElementById('dashboard-screen').classList.contains('hidden');
        if (dashboardVisible) saveGameData(false);
    });

    // المحرك الأساسي والدورية الزمنية
    let autoSaveTimer = 0;
    setInterval(() => {
        if (!document.getElementById('dashboard-screen').classList.contains('hidden')) {
            gameState.monthProgressTimer++;
            const progressPercent = (gameState.monthProgressTimer / MONTH_DURATION_SECONDS) * 100;
            document.getElementById('month-progress').style.width = `${progressPercent}%`;

            if (gameState.monthProgressTimer >= MONTH_DURATION_SECONDS) {
                gameState.monthProgressTimer = 0;
                processMonthlyExpenses();
                updateMarketFluctuations();
                triggerRandomEvents(); // تشغيل الأزمات والأحداث الطارئة
                applyInventorySpoilage(); // تلف المخزون الراكد
                updateRegionalDemand(); // الطلب الإقليمي المتغير بكل محافظة
                processClientContracts(); // تنفيذ عقود العملاء طويلة المدى الشهرية
                refreshContractOffers(); // تجديد عروض العقود الجديدة المتاحة
            }

            processDeliveries();
            runAIReps();
            checkLevelProgress();
            updateRushDealsTimer();
            checkAchievements();
            processIncomingShipments(); // وصول شحنات الموردين المتأخرة تدريجياً
            processAutoReorder(); // إعادة الطلب التلقائي عند انخفاض المخزون

            autoSaveTimer++;
            if (autoSaveTimer >= 30) {
                autoSaveTimer = 0;
                saveGameData(false);
            }
        }
    }, 1000);

    setInterval(() => {
        if (!document.getElementById('dashboard-screen').classList.contains('hidden')) {
            generateMarketDeal();
        }
    }, 6000);

    // تشغيل الأزمات والأحداث الطارئة العشوائية
    function triggerRandomEvents() {
        const roll = Math.random();
        if (roll < 0.15) { // 15% احتمال حدث طارئ كل شهر
            const events = [
                {
                    title: "⛽ ارتفاع طارئ في أسعار البنزين",
                    desc: "ارتفعت تكاليف صيانة وتشغيل الشاحنات لهذا الشهر بنسبة 20%.",
                    action: () => { gameState.tempFuelSurcharge = true; }
                },
                {
                    title: "📋 تفتيش مفاجئ من السلامة والصحة",
                    desc: gameState.warehouse.hasCoolingSystem && gameState.techTree.security ? 
                        "مر التفتيش بنجاح تام وتم الامتثال لكافة معايير السلامة!" : 
                        "تم فرض غرامة قدرها 25,000 ج.م لعدم استكمال ترقيات الأمان كاملة بالمخزن.",
                    action: () => {
                        if (!gameState.warehouse.hasCoolingSystem || !gameState.techTree.security) {
                            gameState.money = Math.max(0, gameState.money - 25000);
                        }
                    }
                },
                {
                    title: "📢 زيادة مفاجئة في الطلب المحلي",
                    desc: "ارتفعت أرباح كافة الصفقات المعروضة بالسوق بنسبة 25% لهذا الشهر!",
                    action: () => { gameState.tempDemandBoost = true; }
                }
            ];

            const ev = events[Math.floor(Math.random() * events.length)];
            ev.action();
            showToast(`⚠️ حدث طارئ: ${ev.title}! ${ev.desc}`, "error");
        }
    }

    // بورصة البضائع والمواسم
    function updateMarketFluctuations() {
        for (let p in baseProductPrices) {
            const variance = (Math.random() * 0.3) - 0.15;
            gameState.marketPrices[p] = Math.max(10, Math.round(baseProductPrices[p] * (1 + variance)));
        }

        const seasons = [
            { name: "موسم شهر رمضان", bonusProd: "bakery", multiplier: 1.5 },
            { name: "فصل الصيف والحر", bonusProd: "dairy", multiplier: 1.4 },
            { name: "موسم المدارس", bonusProd: "dryfood", multiplier: 1.3 },
            { name: "عروض البلاك فرايداي", bonusProd: "cosmetics", multiplier: 1.6 }
        ];

        if (Math.random() < 0.5) {
            gameState.activeSeason = seasons[Math.floor(Math.random() * seasons.length)];
            showToast(`🎉 بدأ الآن: ${gameState.activeSeason.name}! زيادة الطلب والأرباح.`, "success");
        } else {
            gameState.activeSeason = null;
        }

        const govs = gameState.governorates.filter(g => g.unlocked);
        const targetGov = govs[Math.floor(Math.random() * govs.length)];
        gameState.monthlyQuest = {
            title: `شحن 3 طلبات إلى ${targetGov.name}`,
            govId: targetGov.id,
            target: 3,
            current: 0,
            reward: 75000,
            completed: false
        };

        // حساب الأرباح الدورية من الاستثمارات والأسهم
        const passiveIncome = (gameState.investments.dairyShares * 3500) + (gameState.investments.logisticsShares * 8000);
        if (passiveIncome > 0) {
            gameState.money += passiveIncome;
            spawnFloatingNumber(passiveIncome);
            showToast(`📈 حصلت على أرباح استثمارات شهرية قدرها ${passiveIncome.toLocaleString()} ج.م!`, "success");
        }

        // إقرار ضريبي كل 6 أشهر
        if (gameState.month % 6 === 0) {
            const tax = Math.round(gameState.totalRevenueGenerated * 0.05);
            gameState.money = Math.max(0, gameState.money - tax);
            spawnFloatingNumber(-tax);
            showToast(`🏛️ تم خصم الإقرار الضريبي الدوري بـ ${tax.toLocaleString()} ج.م من الخزينة.`, "info");
        }
    }

    // ==========================================
    // 🌟 نظام سمعة الشركة: أول متغير في اللعبة بيقل فعليًا مش بس بيزيد
    // ==========================================
    function adjustReputation(delta) {
        const before = gameState.reputation !== undefined ? gameState.reputation : 70;
        const after = Math.max(0, Math.min(100, before + delta));
        gameState.reputation = after;

        if (delta < 0 && before >= 30 && after < 30) {
            showToast("🚨 سمعة شركتك انهارت! ستلاحظ صفقات أقل وأقل قيمة حتى تستعيد ثقة السوق.", "error");
        } else if (delta > 0 && before < 80 && after >= 80) {
            showToast("🌟 سمعتك ممتازة الآن! عملاء جدد بدأوا يثقون بشركتك أكثر وأرباحك ارتفعت.", "achievement");
        }
        updateUI();
    }

    // ==========================================
    // 📖 الأحداث القصصية: قرارات حقيقية بمخاطرة ومكسب، مش رسائل عابرة
    // ==========================================
    const storyEvents = [
        {
            id: 'shortcut',
            title: '🛣️ طريق مختصر غير رسمي',
            desc: 'أخبرك أحد السائقين عن طريق مختصر غير مرخّص يسرّع كل شحناتك الجارية حالياً بشكل كبير، لكنه مخالف وقد يعرضك لغرامة إذا تم ضبطك.',
            choices: [
                {
                    label: '🚀 خد المخاطرة ونفّذ الطريق',
                    resolve: () => {
                        if (!gameState.activeDeliveries || gameState.activeDeliveries.length === 0) {
                            return 'لا توجد شحنات جارية حالياً للاستفادة من الطريق المختصر.';
                        }
                        gameState.activeDeliveries.forEach(d => { d.timeLeft = Math.max(1, Math.round(d.timeLeft * 0.55)); });
                        if (Math.random() < 0.4) {
                            const fine = 15000;
                            gameState.money = Math.max(0, gameState.money - fine);
                            spawnFloatingNumber(-fine);
                            adjustReputation(-6);
                            return `⚠️ تم ضبط إحدى الشحنات على الطريق! دفعت غرامة ${fine.toLocaleString()} ج.م وتضررت سمعة شركتك.`;
                        }
                        return '✅ نجحت المخاطرة! وصلت كل شحناتك الجارية أسرع بكثير من المعتاد.';
                    }
                },
                {
                    label: '🛡️ ارفض والتزم بالطريق الرسمي',
                    resolve: () => { adjustReputation(3); return '👍 حافظت على سمعة شركتك النظيفة، ولم يتأثر أي شيء في مواعيد الشحن.'; }
                }
            ]
        },
        {
            id: 'shadySupplier',
            title: '📦 مورد بضاعة مشكوك في مصدرها',
            desc: 'عرض عليك تاجر مجهول بيع كمية بضاعة بسعر أقل بـ40% من السوق، لكن مصدرها غير موثّق ومخاطرة قانونية حقيقية.',
            choices: [
                {
                    label: '💰 اشترِ بالمخاطرة (بضاعة مجانية إضافية)',
                    resolve: () => {
                        const products = Object.keys(productNames).filter(p => gameState.signedContracts[p]);
                        if (products.length === 0) return 'لم يكن لديك أي عقود توريد موقعة للاستفادة من العرض، فتجاهلته.';
                        const pid = products[Math.floor(Math.random() * products.length)];
                        const bonusQty = 150;
                        const currentStock = Object.values(gameState.warehouse.stock).reduce((a, b) => a + (b || 0), 0);
                        const freeSpace = Math.max(0, (gameState.warehouse.capacity || 0) - currentStock);
                        const addedQty = Math.min(bonusQty, freeSpace);
                        gameState.warehouse.stock[pid] = (gameState.warehouse.stock[pid] || 0) + addedQty;
                        adjustReputation(-10);
                        if (Math.random() < 0.25) {
                            const fine = 20000;
                            gameState.money = Math.max(0, gameState.money - fine);
                            spawnFloatingNumber(-fine);
                            return `⚠️ اكتُشف مصدر البضاعة المشبوه! حصلت على ${addedQty} كرتونة ${productNames[pid]}، لكن دفعت غرامة ${fine.toLocaleString()} ج.م وتضررت سمعتك بشدة.`;
                        }
                        return `📦 حصلت على ${addedQty} كرتونة ${productNames[pid]} مجاناً تقريباً، لكن سمعة شركتك تضررت بسبب الصفقة المشبوهة.`;
                    }
                },
                {
                    label: '🚫 ارفض العرض المشبوه',
                    resolve: () => { adjustReputation(3); return '👍 رفضت المخاطرة بسمعة شركتك مقابل مكسب سريع مشبوه.'; }
                }
            ]
        },
        {
            id: 'vipDiscount',
            title: '⭐ عميل دائم يطلب تخفيضاً طارئاً',
            desc: 'اتصل بك أحد عملائك الدائمين يطلب خصماً فورياً على طلبه القادم مقابل التزامه المستمر معك.',
            choices: [
                {
                    label: '🤝 وافق على الخصم',
                    resolve: () => {
                        const cost = Math.round(gameState.money * 0.02);
                        gameState.money = Math.max(0, gameState.money - cost);
                        spawnFloatingNumber(-cost);
                        adjustReputation(5);
                        return `تنازلت عن ${cost.toLocaleString()} ج.م كخصم فوري، لكن ثقة عملائك بك ارتفعت بشكل ملحوظ.`;
                    }
                },
                {
                    label: '❌ ارفض بأدب',
                    resolve: () => 'رفضت الطلب بأدب، وبقيت الأمور كما هي دون أي تغيير.'
                }
            ]
        },
        {
            id: 'inspection',
            title: '📋 تفتيش مفاجئ من الجهات الرقابية',
            desc: 'وصل مفتشون لفحص مقر شركتك فجأة. أحد الموظفين يقترح "تسهيل الأمور" بمبلغ بسيط بدل المخاطرة بالتفتيش الكامل.',
            choices: [
                {
                    label: '💵 ادفع رسوم "تسهيل" (10,000 ج.م)',
                    resolve: () => {
                        const cost = 10000;
                        gameState.money = Math.max(0, gameState.money - cost);
                        spawnFloatingNumber(-cost);
                        adjustReputation(-4);
                        return `دفعت ${cost.toLocaleString()} ج.م لتفادي التفتيش، لكن هذا النوع من التعاملات أثّر سلباً على سمعة شركتك إن عُرف به أحد.`;
                    }
                },
                {
                    label: '📑 ارفض وواجه التفتيش بشفافية',
                    resolve: () => {
                        if (Math.random() < 0.35) {
                            const fine = 22000;
                            gameState.money = Math.max(0, gameState.money - fine);
                            spawnFloatingNumber(-fine);
                            return `للأسف ظهرت مخالفات بسيطة ودفعت غرامة ${fine.toLocaleString()} ج.م، لكن نزاهتك محفوظة.`;
                        }
                        adjustReputation(6);
                        return '✅ اجتزت التفتيش بنجاح تام دون أي مخالفات! سمعتك كشركة نزيهة ارتفعت.';
                    }
                }
            ]
        },
        {
            id: 'staffRaise',
            title: '👥 أحد موظفيك القدامى يطلب زيادة',
            desc: 'جاءك أحد أقدم موظفيك (سائق أو مندوب) يطلب زيادة في مستحقاته، وإلا فسيفكر في ترك العمل.',
            choices: [
                {
                    label: '💰 وافق على مكافأة تحفيزية (8,000 ج.م)',
                    resolve: () => {
                        const cost = 8000;
                        gameState.money = Math.max(0, gameState.money - cost);
                        spawnFloatingNumber(-cost);
                        if (gameState.staff.reps.length > 0) {
                            const r = gameState.staff.reps[Math.floor(Math.random() * gameState.staff.reps.length)];
                            r.xp = (r.xp || 0) + 40;
                        }
                        return 'وافقت على منح مكافأة تحفيزية، وارتفعت معنويات فريقك وخبرته.';
                    }
                },
                {
                    label: '🚫 ارفض الطلب',
                    resolve: () => {
                        const roll = Math.random();
                        if (roll < 0.3 && gameState.staff.drivers > 0) {
                            gameState.staff.drivers--;
                            return '😞 استقال أحد سائقيك بسبب رفض طلبه! انخفض عدد السائقين المتاحين لديك.';
                        }
                        return 'قَبِل الموظف الرفض على مضض واستمر في العمل، لكن الأجواء توترت قليلاً.';
                    }
                }
            ]
        }
    ];

    let currentStoryEvent = null;

    function showStoryEventModal(ev) {
        currentStoryEvent = ev;
        document.getElementById('story-event-title').innerText = ev.title;
        document.getElementById('story-event-desc').innerText = ev.desc;
        const choicesContainer = document.getElementById('story-event-choices');
        choicesContainer.innerHTML = '';
        ev.choices.forEach((choice, idx) => {
            const btn = document.createElement('button');
            btn.className = 'menu-btn primary';
            btn.innerText = choice.label;
            btn.onclick = function() { window.resolveStoryEvent(idx); };
            choicesContainer.appendChild(btn);
        });
        document.getElementById('story-event-modal').classList.remove('hidden');
    }

    window.resolveStoryEvent = function(idx) {
        if (!currentStoryEvent) return;
        const resultText = currentStoryEvent.choices[idx].resolve();
        document.getElementById('story-event-modal').classList.add('hidden');
        currentStoryEvent = null;
        updateUI();
        showToast(resultText, "info");
    };

    // نسبة ظهور حدث قصصي شهرياً (يتجنب تكرار نفس الحدث مرتين متتاليتين)
    function maybeTriggerStoryEvent() {
        if (Math.random() < 0.45) {
            const available = storyEvents.filter(e => e.id !== gameState.lastStoryEventId);
            const ev = available[Math.floor(Math.random() * available.length)];
            gameState.lastStoryEventId = ev.id;
            showStoryEventModal(ev);
        }
    }

    // ==========================================
    // 📊 الدورات الاقتصادية: ازدهار / ركود مؤقت يؤثر فعلياً على كل الصفقات
    // ==========================================
    function updateEconomicCycle() {
        if (gameState.economicCycle.monthsRemaining > 0) {
            gameState.economicCycle.monthsRemaining--;
            if (gameState.economicCycle.monthsRemaining <= 0) {
                gameState.economicCycle.type = 'normal';
                showToast('📊 عاد السوق إلى وضعه الطبيعي بعد فترة التقلب الاقتصادي.', 'info');
            }
            return;
        }
        const roll = Math.random();
        if (roll < 0.15) {
            gameState.economicCycle = { type: 'boom', monthsRemaining: 2 + Math.floor(Math.random() * 2) };
            showToast('🚀 ازدهار اقتصادي! السوق في انتعاش وأرباح كل الصفقات ترتفع 30% لعدة أشهر قادمة.', 'achievement');
        } else if (roll < 0.30) {
            gameState.economicCycle = { type: 'recession', monthsRemaining: 2 + Math.floor(Math.random() * 2) };
            showToast('📉 ركود اقتصادي! تراجعت قيمة كل الصفقات بالسوق 25% مؤقتاً حتى يتعافى الاقتصاد.', 'error');
        }
    }

    // ==========================================
    // 🏅 تنافس المندوبين: تقييم مندوب الشهر ومنحه بونص فعلي
    // ==========================================
    function evaluateRepOfMonth() {
        if (!gameState.staff.reps || gameState.staff.reps.length === 0) return;
        let top = null;
        gameState.staff.reps.forEach(r => {
            if (!top || (r.monthSales || 0) > (top.monthSales || 0)) top = r;
        });
        if (top && (top.monthSales || 0) > 0) {
            const bonus = Math.round(top.monthSales * 0.02);
            gameState.money += bonus;
            spawnFloatingNumber(bonus);
            showToast(`🏅 مندوب الشهر: ${top.name}! حقق مبيعات ${top.monthSales.toLocaleString()} ج.م، وحصلت شركتك على بونص أداء إضافي ${bonus.toLocaleString()} ج.م.`, "achievement");
        }
        gameState.staff.reps.forEach(r => { r.monthSales = 0; });
    }

    // ==========================================
    // 🏭 المخازن الفرعية بالمحافظات: تسريع الشحن للمحافظة المبني بها المخزن
    // ==========================================
    window.buildBranchWarehouse = function(govId) {
        const gov = gameState.governorates.find(g => g.id === govId);
        if (!gov) return;
        if (!gov.unlocked) return showToast("يجب فتح المحافظة أولاً قبل بناء مخزن فرعي بها!", "error");
        if (gov.hasBranch) return showToast("يوجد بالفعل مخزن فرعي بهذه المحافظة!", "error");
        if (gameState.money < gov.branchCost) return showToast("الرصيد غير كاف لبناء مخزن فرعي بهذه المحافظة!", "error");

        gameState.money -= gov.branchCost;
        gov.hasBranch = true;
        updateUI();
        showToast(`🏭 تم بناء مخزن فرعي في ${gov.name}! زمن الشحن لهذه المحافظة أصبح أسرع بشكل دائم.`, "success");
        showTab('map');
    };

    // ==========================================
    // 👑 نظام Prestige: بدء إمبراطورية جديدة ببونص دائم بعد إتمام كل شيء
    // ==========================================
    function checkPrestigeEligibility() {
        return gameState.governorates.every(g => g.unlocked)
            && Object.values(gameState.signedContracts).every(v => v === true)
            && gameState.aiCompetitor.isAcquired;
    }

    window.openPrestigeConfirm = function() {
        if (!checkPrestigeEligibility()) return showToast("لم تستوفِ شروط بدء إمبراطورية جديدة بعد! افتح كل المحافظات، وقّع كل العقود، واستحوذ على المنافس أولاً.", "error");
        document.getElementById('prestige-confirm-modal').classList.remove('hidden');
    };

    window.confirmPrestige = function() {
        const newPrestigeLevel = (gameState.prestigeLevel || 0) + 1;
        const newPrestigeBonus = (gameState.prestigeBonus || 0) + 10;
        const playerName = gameState.playerName;

        gameState = JSON.parse(JSON.stringify(defaultGameState));
        gameState.playerName = playerName;
        gameState.prestigeLevel = newPrestigeLevel;
        gameState.prestigeBonus = newPrestigeBonus;
        gameState.money = 500000 + (newPrestigeLevel * 100000);

        normalizeGameState();
        updateRegionalDemand();
        closeModal('prestige-confirm-modal');
        updateUI();
        showTab('admin');
        saveGameData(false);
        showToast(`👑 بدأت إمبراطورية تجارية جديدة! إمبراطورية رقم ${newPrestigeLevel} - بونص دائم +${newPrestigeBonus}% على كل أرباحك للأبد!`, "achievement");
    };

    // ==========================================
    // 🧾 ملخص نهاية الشهر
    // ==========================================
    function showMonthlyRecap(prevMonthNumber, totalExpenses, revenueThisMonth) {
        const stats = gameState.monthStats || { dealsCompleted: 0, revenueByProduct: {} };
        let topProduct = 'لا يوجد';
        let topProductRevenue = 0;
        Object.keys(stats.revenueByProduct).forEach(pid => {
            if (stats.revenueByProduct[pid] > topProductRevenue) {
                topProductRevenue = stats.revenueByProduct[pid];
                topProduct = productNames[pid] || pid;
            }
        });

        const cycleLabel = gameState.economicCycle.type === 'boom' ? '🚀 ازدهار اقتصادي'
            : (gameState.economicCycle.type === 'recession' ? '📉 ركود اقتصادي' : '📊 وضع طبيعي');

        document.getElementById('recap-title').innerText = `📊 ملخص الشهر ${prevMonthNumber}`;
        document.getElementById('recap-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px; text-align:right; font-size:0.85rem;">
                <div>💰 <b>إجمالي الإيرادات:</b> ${revenueThisMonth.toLocaleString()} ج.م</div>
                <div>📉 <b>إجمالي المصروفات:</b> ${totalExpenses.toLocaleString()} ج.م</div>
                <div>🚚 <b>شحنات مكتملة:</b> ${stats.dealsCompleted}</div>
                <div>🏆 <b>أكثر منتج ربحاً:</b> ${topProduct} ${topProductRevenue > 0 ? `(${topProductRevenue.toLocaleString()} ج.م)` : ''}</div>
                <div>🌟 <b>سمعة الشركة الحالية:</b> ${gameState.reputation}/100</div>
                <div>${cycleLabel}</div>
            </div>
        `;
        document.getElementById('recap-modal').classList.remove('hidden');

        gameState.monthStats = { dealsCompleted: 0, revenueByProduct: {} };
    }

    // 📉 تلف المخزون الراكد شهرياً حسب طبيعة كل منتج (يقل التأثير كثيراً مع غرفة التبريد)
    function applyInventorySpoilage() {
        let totalLost = 0;
        Object.keys(spoilRates).forEach(pid => {
            let rate = spoilRates[pid];
            if (rate <= 0) return;
            if (gameState.warehouse.hasCoolingSystem) rate = rate / 2;

            const current = gameState.warehouse.stock[pid] || 0;
            if (current <= 0) return;

            const lost = Math.round(current * rate);
            if (lost > 0) {
                gameState.warehouse.stock[pid] -= lost;
                totalLost += lost;
            }
        });

        if (totalLost > 0) {
            showToast(`📉 تلف ${totalLost} كرتونة من المخزون الراكد بسبب انتهاء الصلاحية الطبيعية. صرّف مخزونك بسرعة أكبر أو ركّب غرفة تبريد لتقليل الخسائر!`, "error");
            updateUI();
        }
    }

    // 📍 الطلب الإقليمي المتغير: يختار منتجاً "ساخناً" لكل محافظة مفتوحة هذا الشهر
    function updateRegionalDemand() {
        const productIds = Object.keys(baseProductPrices);
        const newDemand = {};
        gameState.governorates.forEach(g => {
            if (!g.unlocked) return;
            newDemand[g.id] = productIds[Math.floor(Math.random() * productIds.length)];
        });
        gameState.regionalDemand = newDemand;
    }

    // 🤝 عقود العملاء طويلة المدى: تنفيذ الالتزام الشهري لكل عقد نشط
    function processClientContracts() {
        if (!gameState.clientContracts || gameState.clientContracts.length === 0) return;

        for (let i = gameState.clientContracts.length - 1; i >= 0; i--) {
            const c = gameState.clientContracts[i];
            const availableQty = gameState.warehouse.stock[c.product] || 0;

            if (availableQty >= c.qty) {
                gameState.warehouse.stock[c.product] -= c.qty;
                const revenue = c.qty * c.pricePerUnit;
                gameState.money += revenue;
                gameState.totalRevenueGenerated += revenue;
                spawnFloatingNumber(revenue);
                adjustReputation(1);
                showToast(`🤝 نفّذت التزامك الشهري لعقد (${c.clientName}): ${revenue.toLocaleString()} ج.م.`, "success");
            } else {
                const penalty = Math.round(c.qty * c.pricePerUnit * 0.10);
                gameState.money = Math.max(0, gameState.money - penalty);
                spawnFloatingNumber(-penalty);
                adjustReputation(-8);
                showToast(`⚠️ لم يتوفر مخزون كافٍ من (${productNames[c.product] || c.product}) لتلبية عقد (${c.clientName})! غرامة إخلال: ${penalty.toLocaleString()} ج.م، وتضررت سمعة شركتك.`, "error");
            }

            c.monthsRemaining--;
            if (c.monthsRemaining <= 0) {
                const completionBonus = Math.round(c.qty * c.pricePerUnit * 1.5);
                gameState.money += completionBonus;
                spawnFloatingNumber(completionBonus);
                adjustReputation(4);
                showToast(`🎉 انتهى عقد (${c.clientName}) بنجاح بعد ${c.totalMonths} أشهر من الالتزام! مكافأة إتمام العقد: ${completionBonus.toLocaleString()} ج.م.`, "achievement");
                gameState.clientContracts.splice(i, 1);
            }
        }
        updateUI();
    }

    // 🤝 تجديد عروض عقود العملاء طويلة المدى المتاحة للتوقيع (بحد أقصى عرضين وعقدين نشطين)
    function refreshContractOffers() {
        gameState.contractOffers = [];
        if ((gameState.clientContracts || []).length >= 2) return;

        const availableProducts = Object.keys(productNames).filter(pid => gameState.signedContracts[pid]);
        if (availableProducts.length === 0) return;

        const offerCount = Math.min(2, availableProducts.length);
        const shuffled = [...availableProducts].sort(() => Math.random() - 0.5).slice(0, offerCount);

        shuffled.forEach(pid => {
            const qty = (Math.floor(Math.random() * 3) + 2) * 50; // 100 - 250 كرتونة شهرياً
            const pricePerUnit = Math.round(baseProductPrices[pid] * (1.35 + Math.random() * 0.25)); // سعر أقل من صفقات السوق الحرة لكن مضمون
            const months = Math.floor(Math.random() * 4) + 3; // 3 إلى 6 أشهر

            gameState.contractOffers.push({
                id: Date.now() + Math.random(),
                clientName: clientNames[Math.floor(Math.random() * clientNames.length)],
                product: pid,
                qty, pricePerUnit, months
            });
        });
    }

    window.acceptContractOffer = function(offerId) {
        const offer = gameState.contractOffers.find(o => o.id === offerId);
        if (!offer) return;
        if ((gameState.clientContracts || []).length >= 2) return showToast("لا يمكنك الالتزام بأكثر من عقدين طويلي المدى في نفس الوقت!", "error");

        gameState.clientContracts.push({
            id: Date.now() + Math.random(),
            clientName: offer.clientName,
            product: offer.product,
            qty: offer.qty,
            pricePerUnit: offer.pricePerUnit,
            monthsRemaining: offer.months,
            totalMonths: offer.months
        });

        gameState.contractOffers = gameState.contractOffers.filter(o => o.id !== offerId);
        showToast(`📝 تم توقيع عقد طويل المدى مع (${offer.clientName}) لمدة ${offer.months} أشهر!`, "success");
        updateUI();
        showTab('sales');
    };

    // 🚚 معالجة وصول شحنات الموردين تدريجياً حسب سرعة كل مورد
    function processIncomingShipments() {
        if (!gameState.incomingShipments || gameState.incomingShipments.length === 0) return;

        for (let i = gameState.incomingShipments.length - 1; i >= 0; i--) {
            const shipment = gameState.incomingShipments[i];
            shipment.timeLeft--;

            if (shipment.timeLeft <= 0) {
                let qty = shipment.qty;
                let spoiledMsg = "";

                if (shipment.riskPercent > 0 && Math.random() < shipment.riskPercent) {
                    const lostQty = Math.round(qty * (0.15 + Math.random() * 0.15));
                    qty -= lostQty;
                    spoiledMsg = ` ⚠️ وصلت ${lostQty} كرتونة تالفة الجودة وتم استبعادها.`;
                }

                const currentStock = Object.values(gameState.warehouse.stock).reduce((a, b) => a + (b || 0), 0);
                const freeCapacity = Math.max(0, gameState.warehouse.capacity - currentStock);
                const finalQty = Math.min(qty, freeCapacity);

                gameState.warehouse.stock[shipment.product] = (gameState.warehouse.stock[shipment.product] || 0) + finalQty;

                showToast(`📥 وصلت شحنة (${productNames[shipment.product] || shipment.product}) من ${shipment.supplierName} بكمية ${finalQty} كرتونة.${spoiledMsg}`, "success");
                gameState.incomingShipments.splice(i, 1);
                updateUI();
                if (gameState.currentTab === 'warehouse') showTab('warehouse');
            }
        }
    }

    // 🔄 إعادة الطلب التلقائي: يشتري تلقائياً عند انخفاض المخزون عن الحد المحدد (بمورد قياسي)
    function processAutoReorder() {
        if (!gameState.autoReorder) return;
        Object.keys(gameState.autoReorder).forEach(pid => {
            const cfg = gameState.autoReorder[pid];
            if (!cfg || !cfg.enabled) return;
            if (!gameState.signedContracts[pid]) return;

            const currentStock = gameState.warehouse.stock[pid] || 0;
            if (currentStock >= 100) return; // الحد الأدنى الثابت لإعادة الطلب

            const qty = 150;
            const supplier = supplierProfiles.find(s => s.id === 'standard');
            const price = Math.round((gameState.marketPrices[pid] || baseProductPrices[pid]) * supplier.priceMult);
            const totalCost = price * qty;
            if (gameState.money < totalCost) return; // لا رصيد كافٍ، يحاول مجدداً لاحقاً

            gameState.money -= totalCost;
            spawnFloatingNumber(-totalCost);

            if (supplier.arrivalDelay <= 0) {
                gameState.warehouse.stock[pid] = (gameState.warehouse.stock[pid] || 0) + qty;
            } else {
                gameState.incomingShipments.push({
                    id: Date.now() + Math.random(),
                    product: pid, qty, timeLeft: supplier.arrivalDelay,
                    totalTime: supplier.arrivalDelay,
                    riskPercent: supplier.riskPercent, supplierName: supplier.name
                });
            }
            showToast(`🔄 إعادة طلب تلقائي: تم طلب ${qty} كرتونة ${productNames[pid] || pid} لأن المخزون قل عن الحد الأدنى.`, "info");
        });
    }

    window.toggleAutoReorder = function(product) {
        if (!gameState.autoReorder[product]) gameState.autoReorder[product] = { enabled: false };
        gameState.autoReorder[product].enabled = !gameState.autoReorder[product].enabled;
        showToast(`${gameState.autoReorder[product].enabled ? '✅ تم تفعيل' : '⛔ تم إيقاف'} إعادة الطلب التلقائي لـ ${productNames[product] || product}.`, "info");
        showTab('warehouse');
    };

    function processDeliveries() {
        if (!gameState.activeDeliveries || gameState.activeDeliveries.length === 0) return;

        for (let i = gameState.activeDeliveries.length - 1; i >= 0; i--) {
            let delivery = gameState.activeDeliveries[i];
            delivery.timeLeft--;

            if (delivery.timeLeft <= 0) {
                let finalRev = delivery.totalRevenue;
                let warningMsg = "";

                // إغفال الأعطال والتلف إذا كان التأمين أو الحراسة مفعلين
                if (!gameState.insuranceActive && !gameState.techTree.security) {
                    if (Math.random() < 0.05 && !delivery.delayedOnce) {
                        delivery.delayedOnce = true;
                        delivery.timeLeft = 10;
                        showToast(`⚠️ تعرضت الشاحنة المتجهة لـ (${delivery.govName}) لعطل طفيف! تأخير 10 ثوانٍ.`, "error");
                        continue;
                    }

                    if (delivery.truckType === 'refrigerated' && !gameState.warehouse.hasCoolingSystem && Math.random() < 0.08) {
                        finalRev = Math.round(finalRev * 0.8);
                        warningMsg = " (تم خصم 20% لتلف جزئي لعدم وجود تبريد)";
                    }
                }

                gameState.money += finalRev;
                gameState.totalRevenueGenerated += finalRev;
                AudioEngine.playMoneySound();
                spawnFloatingNumber(finalRev);

                if (!gameState.monthStats) gameState.monthStats = { dealsCompleted: 0, revenueByProduct: {} };
                gameState.monthStats.dealsCompleted++;
                if (delivery.product) {
                    gameState.monthStats.revenueByProduct[delivery.product] = (gameState.monthStats.revenueByProduct[delivery.product] || 0) + finalRev;
                }

                if (delivery.isExport) {
                    gameState.exportDealsCompleted = (gameState.exportDealsCompleted || 0) + 1;
                    adjustReputation(2);
                }

                if (delivery.client) {
                    gameState.vipClients[delivery.client] = (gameState.vipClients[delivery.client] || 0) + 1;
                }

                if (delivery.repIndex !== undefined && gameState.staff.reps[delivery.repIndex]) {
                    let rep = gameState.staff.reps[delivery.repIndex];
                    let commission = Math.round(finalRev * 0.04);
                    rep.unpaidCommission += commission;
                    rep.totalSales += finalRev;
                    rep.monthSales = (rep.monthSales || 0) + finalRev;
                    rep.xp = (rep.xp || 0) + 15;
                    if (rep.xp >= 100) {
                        rep.skill++;
                        rep.xp = 0;
                        showToast(`🌟 ارتفع مستوى المندوب (${rep.name}) إلى Level ${rep.skill}!`, "success");
                    }
                }

                if (gameState.monthlyQuest && !gameState.monthlyQuest.completed && delivery.govId === gameState.monthlyQuest.govId) {
                    gameState.monthlyQuest.current++;
                    if (gameState.monthlyQuest.current >= gameState.monthlyQuest.target) {
                        gameState.monthlyQuest.completed = true;
                        gameState.money += gameState.monthlyQuest.reward;
                        showToast(`🎯 أتممت المهمة الشهرية بنجاح! المكافأة: ${gameState.monthlyQuest.reward.toLocaleString()} ج.م`, "success");
                    }
                }

                showToast(`🚚 وصلت الشاحنة لـ (${delivery.govName})! الأرباح: ${finalRev.toLocaleString()} ج.م.${warningMsg}`, "success");
                gameState.activeDeliveries.splice(i, 1);
                updateUI();
                if (['fleet', 'deals', 'quests'].includes(gameState.currentTab)) showTab(gameState.currentTab);
            }
        }
    }

    function updateRushDealsTimer() {
        if (!gameState.marketDeals) return;
        for (let i = gameState.marketDeals.length - 1; i >= 0; i--) {
            let d = gameState.marketDeals[i];
            if (d.isRush) {
                d.rushTimer--;
                if (d.rushTimer <= 0) {
                    gameState.marketDeals.splice(i, 1);
                    adjustReputation(-2); // فوات صفقة عاجلة يترك انطباعاً سيئاً لدى العملاء المحتملين
                    if (gameState.currentTab === 'deals') showTab('deals');
                }
            }
        }
    }

    function processMonthlyExpenses() {
        gameState.month++;
        const driverSalaries = gameState.staff.drivers * 4000;
        const repSalaries = gameState.staff.reps.length * 3500;
        let truckMaintenance = (gameState.trucks * 2500) + (gameState.refrigeratedTrucks * 3500);
        
        if (gameState.tempFuelSurcharge) {
            truckMaintenance = Math.round(truckMaintenance * 1.2);
            gameState.tempFuelSurcharge = false;
        }

        let loanPayment = 0;
        if (gameState.loan > 0) {
            loanPayment = Math.min(gameState.loan, 11000); 
            gameState.loan -= loanPayment; 
        }

        const totalExpenses = driverSalaries + repSalaries + truckMaintenance + loanPayment;
        gameState.money -= totalExpenses;
        spawnFloatingNumber(-totalExpenses);

        // احسب إيرادات الشهر المنتهي بالمقارنة بآخر نقطة مسجلة قبل هذا الشهر
        const prevRecordedTotal = gameState.revenueHistory.length > 0 ? gameState.revenueHistory[gameState.revenueHistory.length - 1].total : 0;
        const revenueThisMonth = gameState.totalRevenueGenerated - prevRecordedTotal;

        // تسجيل نقطة بيانات شهرية لرسم بياني نمو الأرباح (آخر 12 شهر فقط)
        gameState.revenueHistory.push({ month: gameState.month - 1, total: gameState.totalRevenueGenerated });
        if (gameState.revenueHistory.length > 12) gameState.revenueHistory.shift();

        if (!gameState.aiCompetitor.isAcquired && gameState.governorates.filter(g => g.unlocked).length < 3) {
            gameState.aiCompetitor.share = Math.min(40, gameState.aiCompetitor.share + 2);
        }

        evaluateRepOfMonth();     // 🏅 مندوب الشهر وبونص أدائه
        updateEconomicCycle();    // 📊 تحديث الدورة الاقتصادية (ازدهار/ركود)

        document.getElementById('game-month').innerText = gameState.month;
        updateUI();
        
        let loanMsg = loanPayment > 0 ? ` وشملت سداد قسط قرض بقيمة ${loanPayment.toLocaleString()} ج.م` : '';
        showToast(`📆 انتهى الشهر ${gameState.month - 1}! الخصم الدوري: ${totalExpenses.toLocaleString()} ج.م.${loanMsg}`, loanPayment > 0 ? "info" : "error");
        
        if (gameState.currentTab === 'admin' || gameState.currentTab === 'finance') showTab(gameState.currentTab);

        showMonthlyRecap(gameState.month - 1, totalExpenses, revenueThisMonth); // 🧾 ملخص نهاية الشهر
        maybeTriggerStoryEvent(); // 📖 احتمال ظهور حدث قصصي بقرار حقيقي
    }

    function generateMarketDeal() {
        if (!gameState.office.owned) return;
        
        let maxDeals = 6 + (gameState.marketingLevel * 2);
        if (gameState.techTree.app) maxDeals += 3; // تطبيق الموبايل يزود الصفقات المتاحة
        maxDeals += (gameState.office.level - 1) * 2; // تطوير المقر يزود طاقة استقبال الصفقات (+2 لكل مستوى)
        if ((gameState.reputation !== undefined ? gameState.reputation : 70) < 30) maxDeals = Math.max(3, maxDeals - 2); // سمعة سيئة جداً تنفّر بعض العملاء

        if (gameState.marketDeals.length >= maxDeals) gameState.marketDeals.shift();

        const unlockedGovs = gameState.governorates.filter(g => g.unlocked);
        if (unlockedGovs.length === 0) return;
        const selectedGov = unlockedGovs[Math.floor(Math.random() * unlockedGovs.length)];

        const products = [];
        if (gameState.signedContracts.dairy) products.push({ id: 'dairy', name: 'ألبان', baseSell: 24, reqTruck: 'standard' });
        if (gameState.signedContracts.cleaners) products.push({ id: 'cleaners', name: 'منظفات', baseSell: 55, reqTruck: 'standard' });
        if (gameState.signedContracts.frozen && gameState.level >= 1) products.push({ id: 'frozen', name: 'مجمدات', baseSell: 155, reqTruck: 'refrigerated' });
        if (gameState.signedContracts.bakery && gameState.level >= 2) products.push({ id: 'bakery', name: 'مخبوزات', baseSell: 33, reqTruck: 'standard' });
        if (gameState.signedContracts.dryfood && gameState.level >= 3) products.push({ id: 'dryfood', name: 'مواد غذائية', baseSell: 40, reqTruck: 'standard' });
        if (gameState.signedContracts.cosmetics && gameState.level >= 4) products.push({ id: 'cosmetics', name: 'تجميل', baseSell: 115, reqTruck: 'standard' });

        if (products.length === 0) return;

        const prod = products[Math.floor(Math.random() * products.length)];

        // 🌍 تصدير دولي: صفقة نادرة وضخمة القيمة تظهر فقط بعد فتح كل المحافظات (محتوى نهاية اللعبة)
        const exportReady = gameState.governorates.every(g => g.unlocked);
        const isExport = exportReady && Math.random() < 0.10;

        const client = isExport
            ? exportClientNames[Math.floor(Math.random() * exportClientNames.length)]
            : clientNames[Math.floor(Math.random() * clientNames.length)];
        
        const vipLevel = gameState.vipClients[client] || 0;
        const vipBonus = vipLevel > 5 ? 0.25 : (vipLevel > 2 ? 0.10 : 0);

        let seasonBonus = 0;
        if (gameState.activeSeason && gameState.activeSeason.bonusProd === prod.id) {
            seasonBonus = gameState.activeSeason.multiplier - 1;
        }

        // 📍 الطلب الإقليمي المتغير: منتج بعينه مطلوب بقوة في المحافظة هذا الشهر
        const regionalBonus = (gameState.regionalDemand[selectedGov.id] === prod.id) ? 0.30 : 0;

        const isRush = Math.random() < 0.25; 
        const rushMultiplier = isRush ? 1.8 : 1.0;
        const exportMultiplier = isExport ? 2.3 : 1.0;

        if (isRush) AudioEngine.playAlertSound();

        const qty = (Math.floor(Math.random() * 5) + 1) * 50; 
        const priceVariance = Math.floor(Math.random() * 7) - 2; 
        let pricePerUnit = prod.baseSell + priceVariance;

        let baseDeliveryTime = selectedGov.deliveryTime;
        if (gameState.warehouse.hasAutoLoader) baseDeliveryTime = Math.round(baseDeliveryTime * 0.7);
        if (gameState.techTree.gps) baseDeliveryTime = Math.round(baseDeliveryTime * 0.85); // نظام GPS يقلل زمه الشحن
        if (selectedGov.hasBranch) baseDeliveryTime = Math.round(baseDeliveryTime * 0.7); // مخزن فرعي بالمحافظة يسرّع الشحن ليها

        // 🌟 تأثير سمعة الشركة: سمعة عالية = ربح إضافي وصفقات أكتر، سمعة واطية = عقاب فعلي
        const reputation = gameState.reputation !== undefined ? gameState.reputation : 70;
        let reputationBonus = 0;
        if (reputation >= 80) reputationBonus = 0.15;
        else if (reputation < 30) reputationBonus = -0.20;
        else if (reputation < 45) reputationBonus = -0.08;

        // 📊 الدورة الاقتصادية: ازدهار يرفع كل الأرباح مؤقتاً، ركود يخفضها
        const cycleType = gameState.economicCycle ? gameState.economicCycle.type : 'normal';
        const cycleMultiplier = cycleType === 'boom' ? 1.3 : (cycleType === 'recession' ? 0.75 : 1);

        // 👑 بونص الإمبراطورية الدائم من نظام الـ Prestige
        const prestigeMultiplier = 1 + ((gameState.prestigeBonus || 0) / 100);
        
        let totalRev = Math.round(qty * pricePerUnit * gameState.marketingMultiplier * (1 + selectedGov.bonus + vipBonus + seasonBonus + regionalBonus + reputationBonus) * rushMultiplier * exportMultiplier * cycleMultiplier * prestigeMultiplier);

        const newDeal = {
            id: Date.now() + Math.random(),
            govId: selectedGov.id,
            govName: selectedGov.name,
            deliveryTime: baseDeliveryTime,
            client: client,
            product: prod.id,
            productName: prod.name,
            qty: qty,
            pricePerUnit: pricePerUnit,
            totalRevenue: totalRev,
            reqTruck: prod.reqTruck,
            isRush: isRush,
            rushTimer: isRush ? 20 : 0, 
            isVip: vipLevel >= 3,
            isExport: isExport,
            isRegional: regionalBonus > 0,
            negotiated: false
        };

        gameState.marketDeals.push(newDeal);
        if (gameState.currentTab === 'deals') showTab('deals');
    }

    function runAIReps() {
        if (!gameState.staff.reps || gameState.staff.reps.length === 0 || gameState.marketDeals.length === 0) return;

        gameState.staff.reps.forEach((rep, repIndex) => {
            const successRate = 0.20 + (rep.skill * 0.08); 
            if (Math.random() < successRate && gameState.marketDeals.length > 0) {
                const availableStd = getAvailableTrucks('standard');
                const availableRef = getAvailableTrucks('refrigerated');
                if (gameState.staff.drivers <= gameState.activeDeliveries.length) return;

                const dealIndex = Math.floor(Math.random() * gameState.marketDeals.length);
                const deal = gameState.marketDeals[dealIndex];
                const reqTruck = deal.reqTruck || 'standard';

                const availThisType = reqTruck === 'refrigerated' ? availableRef : availableStd;
                if (availThisType <= 0) return;

                if ((gameState.warehouse.stock[deal.product] || 0) >= deal.qty) {
                    gameState.warehouse.stock[deal.product] -= deal.qty;

                    gameState.activeDeliveries.push({
                        id: Date.now() + Math.random(),
                        client: deal.client,
                        govId: deal.govId,
                        govName: deal.govName,
                        totalRevenue: deal.totalRevenue,
                        timeLeft: deal.deliveryTime,
                        totalTime: deal.deliveryTime,
                        repIndex: repIndex,
                        truckType: reqTruck,
                        product: deal.product,
                        isExport: deal.isExport
                    });

                    gameState.marketDeals.splice(dealIndex, 1);
                    AudioEngine.playTruckSound();
                    showToast(`🤖 المندوب (${rep.name}) خرج بشاحنة لتوصيل طلب لـ ${deal.govName}!`, "info");
                    updateUI();
                    if (['sales', 'deals', 'fleet'].includes(gameState.currentTab)) showTab(gameState.currentTab);
                }
            }
        });
    }

    function checkAchievements() {
        if (!gameState.achievements.firstMillion && gameState.totalRevenueGenerated >= 1000000) {
            gameState.achievements.firstMillion = true;
            gameState.money += 100000;
            spawnFloatingNumber(100000);
            showToast("🏆 إنجاز جديد: نادي المليونير! حصلت على مكافأة 100,000 ج.م", "achievement");
        }
        if (!gameState.achievements.fleetOwner && (gameState.trucks + gameState.refrigeratedTrucks) >= 5) {
            gameState.achievements.fleetOwner = true;
            gameState.money += 50000;
            spawnFloatingNumber(50000);
            showToast("🏆 إنجاز جديد: ملك الطريق! امتلاك 5 شاحنات. مكافأة 50,000 ج.م", "achievement");
        }
        if (!gameState.achievements.techMaster && gameState.techTree.app && gameState.techTree.gps && gameState.techTree.security) {
            gameState.achievements.techMaster = true;
            gameState.money += 150000;
            spawnFloatingNumber(150000);
            showToast("🏆 إنجاز جديد: رواد التكنولوجيا! تم شراء كافة التقنيات الذكية. مكافأة 150,000 ج.م", "achievement");
        }
        if (!gameState.achievements.globalTrader && (gameState.exportDealsCompleted || 0) >= 1) {
            gameState.achievements.globalTrader = true;
            gameState.money += 200000;
            spawnFloatingNumber(200000);
            showToast("🏆 إنجاز جديد: التاجر العالمي 🌍! أتممت أول صفقة تصدير دولي. مكافأة 200,000 ج.م", "achievement");
        }
    }

    // شراء التكنولوجيا والاستثمار
    window.buyTechNode = function(techKey, cost) {
        if (gameState.money < cost) return showToast("الرصيد غير كاف لشراء هذه التقنية!", "error");
        gameState.money -= cost;
        gameState.techTree[techKey] = true;
        updateUI();
        showToast("🚀 تم تفعيل التقنية وتطوير البنية الذكية للشركة بنجاح!", "success");
        showTab('tech');
    };

    window.buyInvestment = function(type, cost) {
        if (gameState.money < cost) return showToast("الرصيد غير كاف لشراء الحصة الاستثمارية!", "error");
        gameState.money -= cost;
        gameState.investments[type]++;
        updateUI();
        showToast("📈 تم شراء السهم الاستثماري بنجاح! يمنحك عائداً شهرياً ثابتاً.", "success");
        showTab('finance');
    };

    window.acquireCompetitor = function() {
        const cost = gameState.aiCompetitor.takeoverCost;
        if (gameState.money < cost) return showToast("الرصيد غير كاف للاستحواذ على الشركة المنافسة!", "error");
        gameState.money -= cost;
        gameState.aiCompetitor.isAcquired = true;
        gameState.aiCompetitor.share = 0;
        updateUI();
        showToast("👑 تم الاستحواذ الكامل على شركة النصر للتوزيع والسيطرة الحصرية على السوق!", "success");
        showTab('admin');
    };

    window.toggleInsurance = function() {
        if (!gameState.insuranceActive) {
            if (gameState.money < 15000) return showToast("الرصيد غير كاف لتفعيل التأمين (15,000 ج.م)!", "error");
            gameState.money -= 15000;
            gameState.insuranceActive = true;
            showToast("🛡️ تم تفعيل التأمين الشامل لحماية الشحنات من أي تلف أو حوادث!", "success");
        } else {
            gameState.insuranceActive = false;
            showToast("تم إيقاف خدمة التأمين الشامل.", "info");
        }
        updateUI();
        showTab('finance');
    };

    window.confirmPlayerName = function() {
        const inputVal = document.getElementById('player-name-input').value.trim();
        gameState.playerName = inputVal ? `التاجر ${inputVal}` : 'التاجر الجديد';
        document.getElementById('name-modal').classList.add('hidden');
        document.getElementById('dashboard-screen').classList.remove('hidden');
        updateRegionalDemand();
        showTab('admin', document.getElementById('btn-admin'));
        updateUI();
        saveGameData(false);
        showToast(`أهلاً بك يا ${gameState.playerName}! ابدأ تأسيس تجارتك من دمياط.`, "success");
    };

    window.openEditNameModal = function() {
        document.getElementById('edit-name-input').value = gameState.playerName.replace('التاجر ', '');
        document.getElementById('edit-name-modal').classList.remove('hidden');
    };

    window.saveNewPlayerName = function() {
        const val = document.getElementById('edit-name-input').value.trim();
        if(val) {
            gameState.playerName = `التاجر ${val}`;
            updateUI();
            closeModal('edit-name-modal');
            showToast("تم تحديث اسمك التجاري بنجاح!", "success");
            if(gameState.currentTab === 'admin') showTab('admin');
        }
    };

    window.openExportModal = async function() {
        // لو بنصدّر من شاشة البداية (قبل ما تبدأ الجلسة)، نقرأ الحفظة الحقيقية من التخزين المحلي أولاً
        const dashboardHidden = document.getElementById('dashboard-screen').classList.contains('hidden');
        if (dashboardHidden) {
            const dataStr = localStorage.getItem(SAVE_KEY_PRIMARY) || localStorage.getItem(SAVE_KEY_BACKUP);
            if (!dataStr) return showToast("لا توجد بيانات محفوظة لتصديرها بعد! ابدأ لعبة أولاً.", "error");
            try {
                const loaded = JSON.parse(dataStr);
                gameState = Object.assign({}, JSON.parse(JSON.stringify(defaultGameState)), loaded);
                normalizeGameState();
            } catch (e) { return showToast("تعذر قراءة الحفظة الحالية للتصدير!", "error"); }
        } else {
            await saveGameData(false);
        }
        const dataStr2 = JSON.stringify(gameState);
        const code = btoa(encodeURIComponent(dataStr2));
        document.getElementById('export-code-area').value = code;
        document.getElementById('export-code-modal').classList.remove('hidden');
    };

    window.copySaveCode = function() {
        const area = document.getElementById('export-code-area');
        area.select();
        document.execCommand('copy');
        showToast("تم نسخ كود الاسترجاع بنجاح!", "success");
    };

    window.openImportModal = function() {
        document.getElementById('import-code-area').value = "";
        document.getElementById('import-code-modal').classList.remove('hidden');
    };

    window.applyImportCode = async function() {
        const code = document.getElementById('import-code-area').value.trim();
        if(!code) return showToast("يرجى إدخال الكود أولاً!", "error");

        try {
            const decodedStr = decodeURIComponent(atob(code));
            const parsedData = JSON.parse(decodedStr);

            if(parsedData && parsedData.playerName) {
                const savedChecksum = parsedData.checksum;
                const calculatedChecksum = await generateChecksum(parsedData);

                if (!savedChecksum || savedChecksum !== calculatedChecksum) {
                    return showToast("❌ كود الاسترجاع غير صالح أو تم التلاعب بقيمه!", "error");
                }

                gameState = Object.assign({}, JSON.parse(JSON.stringify(defaultGameState)), parsedData);
                normalizeGameState();
                await saveGameData(false);
                updateUI();
                closeModal('import-code-modal');
                closeModal('start-settings-modal');
                document.getElementById('start-screen').classList.add('hidden');
                document.getElementById('name-modal').classList.add('hidden');
                document.getElementById('dashboard-screen').classList.remove('hidden');
                showTab('admin');
                showToast("تم استعادة كافة البيانات وحفظها بنجاح!", "success");
            } else { showToast("كود الاسترجاع غير صالح!", "error"); }
        } catch(e) { showToast("حدث خطأ أثناء فك تشفير الكود!", "error"); }
    };

    window.openResetConfirmModal = function() { document.getElementById('reset-confirm-modal').classList.remove('hidden'); };

    function executeGameReset() {
        localStorage.removeItem(SAVE_KEY_PRIMARY);
        localStorage.removeItem(SAVE_KEY_BACKUP);
        gameState = JSON.parse(JSON.stringify(defaultGameState));
        closeModal('reset-confirm-modal');
        closeModal('start-settings-modal');
        document.getElementById('dashboard-screen').classList.add('hidden');
        document.getElementById('name-modal').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        refreshStartScreenState();
        showToast("تم مسح كافة البيانات وإعادة اللعبة للوضع الافتراضي.", "info");
    }
    window.executeGameReset = executeGameReset;

    window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); };

    function getAvailableTrucks(truckType = 'standard') {
        const busyTrucks = gameState.activeDeliveries ? gameState.activeDeliveries.filter(d => (d.truckType || 'standard') === truckType).length : 0;
        const totalTrucks = truckType === 'refrigerated' ? (gameState.refrigeratedTrucks || 0) : (gameState.trucks || 0);
        return Math.max(0, totalTrucks - busyTrucks);
    }

    function updateUI() {
        document.getElementById('display-player-name').innerText = gameState.playerName;
        document.getElementById('player-money').innerText = gameState.money.toLocaleString() + " ج.م";
        document.getElementById('player-loan').innerText = gameState.loan.toLocaleString() + " ج.م";
        document.getElementById('player-lvl').innerText = gameState.level;
        document.getElementById('game-month').innerText = gameState.month;
        
        const availStd = getAvailableTrucks('standard');
        const availRef = getAvailableTrucks('refrigerated');
        const totalAllTrucks = (gameState.trucks || 0) + (gameState.refrigeratedTrucks || 0);
        const availAllTrucks = availStd + availRef;
        document.getElementById('trucks-status').innerText = `${availAllTrucks} متاحة / ${totalAllTrucks}`;

        const totalStock = (gameState.warehouse.stock?.dairy || 0) + (gameState.warehouse.stock?.cleaners || 0) + (gameState.warehouse.stock?.frozen || 0) + (gameState.warehouse.stock?.bakery || 0) + (gameState.warehouse.stock?.dryfood || 0) + (gameState.warehouse.stock?.cosmetics || 0);
        document.getElementById('wh-capacity').innerText = `${totalStock} / ${gameState.warehouse.capacity || 0}`;
    }

    function checkLevelProgress() {
        const newLevel = Math.floor(gameState.totalRevenueGenerated / 250000) + 1;
        if (newLevel > gameState.level) {
            gameState.level = newLevel;
            showToast(`🎉 مبروك يا ${gameState.playerName}! ارتفع مستواك الفعلي إلى Level ${gameState.level}!`, "success");
            updateUI();
        }
    }

    function showToast(message, type = "info") {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-msg ${type}`;
        let icon = type === "success" ? "✅" : (type === "error" ? "⚠️" : (type === "achievement" ? "🏆" : "🔔"));
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-100%)';
            toast.style.transition = 'all 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, 3200);
    }

    // ==========================================
    // 🎨 مساعدات الرسومات: أرقام طايرة + خريطة SVG + رسم بياني
    // ==========================================

    // يعرض رقم "+X ج.م" أو "-X ج.م" طاير بجانب رصيد الخزينة بأعلى الشاشة
    function spawnFloatingNumber(amount) {
        try {
            if (!amount) return;
            const container = document.getElementById('game-container');
            const anchor = document.getElementById('player-money');
            if (!container || !anchor) return;

            const containerRect = container.getBoundingClientRect();
            const anchorRect = anchor.getBoundingClientRect();

            const el = document.createElement('div');
            const isNeg = amount < 0;
            el.className = 'floating-number' + (isNeg ? ' negative' : '');
            el.innerText = `${isNeg ? '-' : '+'}${Math.abs(Math.round(amount)).toLocaleString()} ج.م`;
            el.style.left = `${anchorRect.left - containerRect.left + (Math.random() * 30 - 15)}px`;
            el.style.top = `${anchorRect.top - containerRect.top + 18}px`;
            container.appendChild(el);
            setTimeout(() => el.remove(), 1550);
        } catch (e) { /* رسوم غير حرجة، يتم تجاهل أي خطأ فيها بأمان */ }
    }

    // يبني خريطة SVG تخطيطية (Stylized) لمحافظات التوزيع ومسار الشحن بينها
    function buildGovernorateMapSVG() {
        const positions = {
            domyat:   { x: 45,  y: 120 },
            dakahlia: { x: 145, y: 55  },
            sharqia:  { x: 245, y: 120 },
            cairo:    { x: 345, y: 55  },
            alex:     { x: 425, y: 120 }
        };
        const chain = ['domyat', 'dakahlia', 'sharqia', 'cairo', 'alex'];

        let lines = '';
        for (let i = 0; i < chain.length - 1; i++) {
            const a = positions[chain[i]];
            const b = positions[chain[i + 1]];
            const toGov = gameState.governorates.find(g => g.id === chain[i + 1]);
            const isActive = toGov && toGov.unlocked;
            lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${isActive ? '#10b981' : '#334155'}" stroke-width="3" stroke-dasharray="${isActive ? '0' : '6,6'}" />`;
        }

        let nodes = '';
        gameState.governorates.forEach(g => {
            const pos = positions[g.id];
            if (!pos) return;
            const canUnlock = gameState.level >= g.minLvl;
            const fillColor = g.unlocked ? '#10b981' : (canUnlock ? '#f59e0b' : '#334155');
            const labelColor = g.unlocked ? '#10b981' : '#94a3b8';
            const shortName = g.name.split(' ')[0];

            nodes += `
                <g style="cursor:${!g.unlocked && canUnlock ? 'pointer' : 'default'};" onclick="${!g.unlocked && canUnlock ? `unlockGovernorate('${g.id}')` : ''}">
                    <circle cx="${pos.x}" cy="${pos.y}" r="22" fill="${fillColor}" fill-opacity="0.22" stroke="${fillColor}" stroke-width="2.5" />
                    <circle cx="${pos.x}" cy="${pos.y}" r="6" fill="${fillColor}" />
                    ${g.id === 'domyat' ? `<text x="${pos.x}" y="${pos.y - 32}" text-anchor="middle" font-size="16">🏢</text>` : `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-size="13">${g.unlocked ? '✅' : '🔒'}</text>`}
                    <text x="${pos.x}" y="${pos.y + 42}" text-anchor="middle" fill="${labelColor}" font-size="11" font-weight="800">${shortName}</text>
                </g>
            `;
        });

        return `
            <div class="gov-map-wrap">
                <svg viewBox="0 0 460 175" style="width:100%; max-width:560px; height:auto; display:block; margin:0 auto;">
                    ${lines}
                    ${nodes}
                </svg>
                <div style="text-align:center; font-size:0.72rem; color:var(--text-muted); margin-top:4px;">اضغط على أي محافظة مقفولة (🔒) لفتحها مباشرة إن كنت مستوفياً للشروط</div>
            </div>
        `;
    }

    // يبني رسم بياني SVG بسيط يوضح نمو إجمالي المبيعات عبر آخر الشهور
    function buildRevenueChartSVG() {
        const data = gameState.revenueHistory || [];
        if (data.length < 2) {
            return `<div style="color:var(--text-muted); font-size:0.82rem; text-align:center; padding:18px 0;">ستظهر بيانات نمو الأرباح هنا بعد مرور شهرين على الأقل من اللعب.</div>`;
        }

        const w = 400, h = 130, pad = 12;
        const values = data.map(d => d.total);
        const maxV = Math.max(...values, 1);
        const minV = Math.min(...values, 0);
        const range = (maxV - minV) || 1;
        const stepX = (w - pad * 2) / (data.length - 1);

        const points = data.map((d, i) => {
            const x = pad + i * stepX;
            const y = h - pad - ((d.total - minV) / range) * (h - pad * 2);
            return `${x},${y}`;
        }).join(' ');

        const areaPoints = `${pad},${h - pad} ${points} ${pad + (data.length - 1) * stepX},${h - pad}`;
        const lastX = pad + (data.length - 1) * stepX;
        const lastY = h - pad - ((data[data.length - 1].total - minV) / range) * (h - pad * 2);

        return `
            <div class="revenue-chart-wrap">
                <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:120px; display:block;">
                    <polyline points="${areaPoints}" fill="rgba(16, 185, 129, 0.15)" stroke="none" />
                    <polyline points="${points}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
                    <circle cx="${lastX}" cy="${lastY}" r="4" fill="#10b981" />
                </svg>
                <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
                    <span>شهر ${data[0].month}</span>
                    <span>الحالي: ${data[data.length - 1].total.toLocaleString()} ج.م</span>
                </div>
            </div>
        `;
    }

    window.buyCoolingSystem = function() {
        if(gameState.money < 75000) return showToast("الرصيد غير كاف لتنصيب نظام التبريد!", "error");
        gameState.money -= 75000;
        gameState.warehouse.hasCoolingSystem = true;
        updateUI();
        showToast("❄️ تم تركيب نظام التبريد المتطور بنجاح!", "success");
        showTab('warehouse');
    };

    window.buyAutoLoader = function() {
        if(gameState.money < 100000) return showToast("الرصيد غير كاف لتركيب التحميل الآلي!", "error");
        gameState.money -= 100000;
        gameState.warehouse.hasAutoLoader = true;
        updateUI();
        showToast("⚡ تم تركيب نظام التحميل الآلي وتقليل زمن الشحن 30%!", "success");
        showTab('warehouse');
    };

    window.unlockGovernorate = function(govId) {
        const gov = gameState.governorates.find(g => g.id === govId);
        if(!gov) return;

        if (gameState.level < gov.minLvl) return showToast(`يجب الوصول للمستوى ${gov.minLvl} أولاً!`, "error");
        if (gameState.money < gov.cost) return showToast(`الرصيد غير كاف لفتح ${gov.name}!`, "error");

        gameState.money -= gov.cost;
        gov.unlocked = true;
        updateUI();
        showToast(`🎉 تم فتح التوزيع في ${gov.name}!`, "success");
        showTab('map');
    };

    window.expandWarehouseCapacity = function() {
        if (gameState.money < WAREHOUSE_EXPAND_COST) {
            return showToast(`الرصيد غير كاف لتوسعة المخزن! تحتاج ${WAREHOUSE_EXPAND_COST.toLocaleString()} ج.م`, "error");
        }

        gameState.money -= WAREHOUSE_EXPAND_COST;
        gameState.warehouse.capacity += 300;
        updateUI();
        showToast(`📦 تم توسعة المخزن! السعة الجديدة: ${gameState.warehouse.capacity} كرتونة`, "success");
        showTab('warehouse');
    };

    window.buyWarehouse = function(cost, cap) {
        if(gameState.money < cost) return showToast("الرصيد غير كاف لشراء المخزن!", "error");
        gameState.money -= cost;
        gameState.warehouse.owned = true;
        gameState.warehouse.capacity = cap;
        updateUI();
        showToast("🏭 تم شراء أول مخزن لك بنجاح!", "success");
        showTab('warehouse');
    };

    window.buyStock = function(product, count, supplierId = 'standard') {
        const supplier = supplierProfiles.find(s => s.id === supplierId) || supplierProfiles[1];
        const marketPrice = gameState.marketPrices[product] || baseProductPrices[product];
        const pricePerUnit = Math.round(marketPrice * supplier.priceMult);
        const totalCost = pricePerUnit * count;
        const currentStock = (gameState.warehouse.stock.dairy || 0) + (gameState.warehouse.stock.cleaners || 0) + (gameState.warehouse.stock.frozen || 0) + (gameState.warehouse.stock.bakery || 0) + (gameState.warehouse.stock.dryfood || 0) + (gameState.warehouse.stock.cosmetics || 0);
        const pendingQty = gameState.incomingShipments.reduce((sum, s) => sum + (s.product === product ? s.qty : 0), 0);
        
        if(currentStock + pendingQty + count > gameState.warehouse.capacity) return showToast("المخزن (بما فيه الشحنات الواردة) لا يتسع لهذه الكمية!", "error");
        if(gameState.money < totalCost) return showToast("الرصيد غير كاف لشراء البضاعة!", "error");

        gameState.money -= totalCost;
        spawnFloatingNumber(-totalCost);

        if (supplier.arrivalDelay <= 0) {
            // مورد فوري: البضاعة توصل فورًا للمخزن
            gameState.warehouse.stock[product] = (gameState.warehouse.stock[product] || 0) + count;
            showToast(`⚡ تم شراء ${count} كرتونة فوراً من ${supplier.name} بسعر ${pricePerUnit} ج.م/كرتونة!`, "success");
        } else {
            // مورد اقتصادي أو قياسي: البضاعة في الطريق وتصل بعد فترة، مع احتمال خسارة جزء من الجودة
            gameState.incomingShipments.push({
                id: Date.now() + Math.random(),
                product, qty: count, timeLeft: supplier.arrivalDelay, totalTime: supplier.arrivalDelay,
                riskPercent: supplier.riskPercent, supplierName: supplier.name
            });
            showToast(`🚚 تم طلب ${count} كرتونة من ${supplier.name} بسعر ${pricePerUnit} ج.م/كرتونة، ستصل خلال ${supplier.arrivalDelay} ثانية.`, "info");
        }

        updateUI();
        showTab('warehouse');
    };

    window.buyOffice = function(cost) {
        if(gameState.money < cost) return showToast("الرصيد غير كاف لشراء المقر!", "error");
        gameState.money -= cost;
        gameState.office.owned = true;
        updateUI();
        showToast("🏢 تم تأسيس المقر الرئيسي بدمياط بنجاح!", "success");
        showTab('company');
    };

    window.upgradeOffice = function(cost) {
        if(gameState.money < cost) return showToast("الرصيد غير كاف للتطوير!", "error");
        gameState.money -= cost;
        gameState.office.level++;
        updateUI();
        showToast("✨ تم تطوير المقر الرئيسي!", "success");
        showTab('company');
    };

    window.buyTruck = function(type = 'standard') {
        const cost = type === 'refrigerated' ? 140000 : 80000;
        const name = type === 'refrigerated' ? "شاحنة ثلاجة مبردة" : "شاحنة نقل جامبو";
        if(gameState.money < cost) return showToast(`الرصيد غير كاف لشراء ${name}!`, "error");
        gameState.money -= cost;
        
        if (type === 'refrigerated') {
            gameState.refrigeratedTrucks = (gameState.refrigeratedTrucks || 0) + 1;
        } else {
            gameState.trucks = (gameState.trucks || 0) + 1;
        }
        
        updateUI();
        showToast(`🚚 تم إضافة ${name} جديدة للأسطول!`, "success");
        showTab('fleet');
    };

    window.hireDriver = function() {
        const cost = 5000;
        if(gameState.money < cost) return showToast("الرصيد غير كاف لتعيين سائق!", "error");
        gameState.money -= cost;
        gameState.staff.drivers++;
        updateUI();
        showToast("👨‍✈️ تم تعيين سائق جديد!", "success");
        showTab('hr');
    };

    window.hireRep = function() {
        const cost = 10000;
        if(gameState.money < cost) return showToast("الرصيد غير كاف لتعيين مندوب!", "error");
        gameState.money -= cost;
        const names = ["أحمد", "محمود", "إبراهيم", "سيد", "مصطفى", "حسن", "علي", "طارق", "كريم", "زياد"];
        const randomName = names[Math.floor(Math.random() * names.length)];
        gameState.staff.reps.push({
            name: randomName,
            skill: 1,
            xp: 0,
            totalSales: 0,
            monthSales: 0,
            unpaidCommission: 0
        });
        updateUI();
        showToast("👨‍💼 تم تعيين مندوب مبيعات جديد!", "success");
        showTab('hr');
    };

    window.payCommission = function(index) {
        const rep = gameState.staff.reps[index];
        if(!rep || rep.unpaidCommission <= 0) return showToast("لا يوجد عمولة مستحقة للصرف!", "error");
        if(gameState.money < rep.unpaidCommission) return showToast("الرصيد غير كاف لصرف العمولة!", "error");

        gameState.money -= rep.unpaidCommission;
        showToast(`💸 تم صرف مبلغ ${rep.unpaidCommission.toLocaleString()} ج.م للمندوب ${rep.name}`, "success");
        rep.unpaidCommission = 0;
        updateUI();
        showTab('sales');
    };

    window.signContract = function(type, cost, reqLvl = 1) {
        if(gameState.level < reqLvl) return showToast(`يتطلب توقيع هذا العقد الوصول للمستوى Level ${reqLvl} أولاً!`, "error");
        if(gameState.money < cost) return showToast("الرصيد غير كاف لتوقيع العقد!", "error");
        gameState.money -= cost;
        gameState.signedContracts[type] = true;
        updateUI();
        showToast("📄 تم توقيع عقد التوريد بنجاح!", "success");
        showTab('contracts');
    };

    window.upgradeMarketing = function(cost, multiplier) {
        if(gameState.money < cost) return showToast("الرصيد غير كاف لترقية التسويق!", "error");
        gameState.money -= cost;
        gameState.marketingLevel++;
        gameState.marketingMultiplier = multiplier;
        updateUI();
        showToast("📢 تم ترقية الحملة التسويقية!", "success");
        showTab('marketing');
    };

    window.takeLoan = function(amount) {
        if(gameState.loan > 0) return showToast("لديك قروض سابقة لم تقم بسدادها بعد!", "error");
        gameState.money += amount;
        gameState.loan += Math.round(amount * 1.15); 
        updateUI();
        showToast(`🏦 تم الحصول على قرض بقيمة ${amount.toLocaleString()} ج.م بفائدة 15%`, "success");
        showTab('finance');
    };

    window.payLoan = function() {
        if(gameState.loan <= 0) return showToast("ليس عليك أي قروض حالياً!", "error");
        if(gameState.money < gameState.loan) return showToast("الرصيد غير كاف لسداد القرض بالكامل!", "error");

        gameState.money -= gameState.loan;
        showToast(`🎉 تم سداد كامل القرض البالغ ${gameState.loan.toLocaleString()} ج.م بنجاح!`, "success");
        gameState.loan = 0;
        updateUI();
        showTab('finance');
    };

    window.executeManualDeal = function(dealId) {
        const dealIndex = gameState.marketDeals.findIndex(d => d.id === dealId);
        if(dealIndex === -1) return;
        const deal = gameState.marketDeals[dealIndex];
        const reqTruck = deal.reqTruck || 'standard';

        const availTrucks = getAvailableTrucks(reqTruck);
        const totalTrucksOfType = reqTruck === 'refrigerated' ? gameState.refrigeratedTrucks : gameState.trucks;

        if(totalTrucksOfType <= 0) return showToast(`لا تملك أي ${reqTruck === 'refrigerated' ? 'شاحنات مبردة' : 'شاحنات عادية'} لشحن هذا الطلب!`, "error");
        if(availTrucks <= 0) return showToast("جميع شاحناتك من هذا النوع مشغولة حالياً!", "error");
        if(gameState.staff.drivers <= gameState.activeDeliveries.length) return showToast("لا يوجد سائق متاح حالياً!", "error");
        if((gameState.warehouse.stock[deal.product] || 0) < deal.qty) return showToast("البضاعة غير متوفرة في المخزن لهذا الطلب!", "error");

        gameState.warehouse.stock[deal.product] -= deal.qty;
        
        gameState.activeDeliveries.push({
            id: Date.now() + Math.random(),
            client: deal.client,
            govId: deal.govId,
            govName: deal.govName,
            totalRevenue: deal.totalRevenue,
            timeLeft: deal.deliveryTime,
            totalTime: deal.deliveryTime,
            truckType: reqTruck,
            product: deal.product,
            isExport: deal.isExport
        });

        gameState.marketDeals.splice(dealIndex, 1);
        AudioEngine.playTruckSound();

        updateUI();
        showToast(`🚚 خرجت الشاحنة لتوصيل الطلب إلى ${deal.govName}! مدة الرحلة: ${deal.deliveryTime} ثوانٍ`);
    };

    // 🤝 مفاوضة على الصفقات الكبيرة (فوق 60,000 ج.م): محاولة واحدة لكل صفقة، بمخاطرة حقيقية
    window.negotiateDeal = function(dealId) {
        const deal = gameState.marketDeals.find(d => d.id === dealId);
        if (!deal) return;
        if (deal.negotiated) return showToast("لقد فاوضت هذا العميل بالفعل على هذه الصفقة!", "error");

        deal.negotiated = true;
        const roll = Math.random();

        if (roll < 0.55) {
            const boost = 0.15 + (Math.random() * 0.10);
            deal.totalRevenue = Math.round(deal.totalRevenue * (1 + boost));
            showToast(`🤝 وافق العميل (${deal.client}) على سعر أفضل! ارتفعت قيمة الصفقة بنسبة ${Math.round(boost * 100)}%.`, "success");
        } else if (roll < 0.90) {
            deal.totalRevenue = Math.round(deal.totalRevenue * 0.85);
            showToast(`😕 لم يقتنع العميل (${deal.client}) بالكامل، وخفّض قيمة الصفقة بنسبة 15%.`, "error");
        } else {
            const idx = gameState.marketDeals.findIndex(d => d.id === dealId);
            if (idx !== -1) gameState.marketDeals.splice(idx, 1);
            adjustReputation(-3);
            showToast(`🚪 انسحب العميل (${deal.client}) من الصفقة بعد المفاوضة! حاول تقبل الصفقات الكبيرة بسرعة أكبر في المرة القادمة.`, "error");
        }

        updateUI();
        showTab('deals');
    };

    // 📊 فرز صفقات السوق: افتراضي / الأعلى ربحاً / الأقرب انتهاءً
    window.setDealsSortMode = function(mode) {
        gameState.dealsSortMode = mode;
        showTab('deals');
    };

    // 📦 تجميع عدة صفقات لنفس المحافظة ونفس نوع الشاحنة في رحلة واحدة (Route Bundling)
    let selectedDealIds = new Set(); // اختيار مؤقت لا يُحفظ ضمن ملف الحفظ

    window.toggleDealSelection = function(dealId) {
        if (selectedDealIds.has(dealId)) selectedDealIds.delete(dealId);
        else selectedDealIds.add(dealId);
        showTab('deals');
    };

    window.executeBundledDeals = function() {
        const ids = Array.from(selectedDealIds);
        if (ids.length < 2) return showToast("اختر صفقتين على الأقل لنفس المحافظة ونفس نوع الشاحنة لتجميعهما!", "error");

        const deals = gameState.marketDeals.filter(d => ids.includes(d.id));
        if (deals.length < 2) { selectedDealIds.clear(); return showToast("بعض الصفقات المختارة لم تعد متاحة!", "error"); }

        const govId = deals[0].govId;
        const reqTruck = deals[0].reqTruck || 'standard';
        if (!deals.every(d => d.govId === govId && (d.reqTruck || 'standard') === reqTruck)) {
            return showToast("لا يمكن تجميع صفقات لمحافظات أو أنواع شاحنات مختلفة في رحلة واحدة!", "error");
        }

        const productTotals = {};
        deals.forEach(d => { productTotals[d.product] = (productTotals[d.product] || 0) + d.qty; });
        for (const pid in productTotals) {
            if ((gameState.warehouse.stock[pid] || 0) < productTotals[pid]) {
                return showToast(`البضاعة (${productNames[pid] || pid}) غير متوفرة بالمخزن لتغطية كل الصفقات المجمعة!`, "error");
            }
        }
        if (getAvailableTrucks(reqTruck) <= 0) return showToast("لا توجد شاحنة متاحة من هذا النوع لتنفيذ الرحلة المجمعة!", "error");
        if (gameState.staff.drivers <= gameState.activeDeliveries.length) return showToast("لا يوجد سائق متاح حالياً!", "error");

        Object.keys(productTotals).forEach(pid => { gameState.warehouse.stock[pid] -= productTotals[pid]; });

        const totalRevenue = deals.reduce((sum, d) => sum + d.totalRevenue, 0);
        const maxDeliveryTime = Math.max(...deals.map(d => d.deliveryTime));
        const bundleBonus = Math.round(totalRevenue * 0.05 * (deals.length - 1)); // مكافأة تجميع الرحلات

        gameState.activeDeliveries.push({
            id: Date.now() + Math.random(),
            client: `رحلة مجمّعة (${deals.length} عملاء)`,
            govId: govId,
            govName: deals[0].govName,
            totalRevenue: totalRevenue + bundleBonus,
            timeLeft: maxDeliveryTime,
            totalTime: maxDeliveryTime,
            truckType: reqTruck,
            isBundle: true
        });

        ids.forEach(id => {
            const idx = gameState.marketDeals.findIndex(d => d.id === id);
            if (idx !== -1) gameState.marketDeals.splice(idx, 1);
        });

        selectedDealIds.clear();
        AudioEngine.playTruckSound();
        updateUI();
        showToast(`📦 تم تجميع ${deals.length} صفقات إلى ${deals[0].govName} في رحلة واحدة! مكافأة التجميع: +${bundleBonus.toLocaleString()} ج.م`, "success");
        showTab('deals');
    };

    function showTab(tabName, btnElement = null) {
        gameState.currentTab = tabName;
        
        if(btnElement) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btnElement.classList.add('active');
        } else {
            const currentBtn = document.getElementById(`btn-${tabName}`);
            if(currentBtn) {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                currentBtn.classList.add('active');
            }
        }

        const container = document.getElementById('tab-content');
        container.innerHTML = '';

        if(tabName === 'admin') {
            const monthlySalaries = (gameState.staff.drivers * 4000) + (gameState.staff.reps.length * 3500);
            const monthlyTrucks = (gameState.trucks * 2500) + (gameState.refrigeratedTrucks * 3500);
            const monthlyLoan = gameState.loan > 0 ? Math.min(gameState.loan, 11000) : 0;
            const totalMonthly = monthlySalaries + monthlyTrucks + monthlyLoan;

            container.innerHTML = `
                <h2>👔 إدارة المدير التنفيذي</h2>
                <p style="color:var(--text-muted); margin-top:5px;">لوحة النظرة العامة على أدائك التجاري ومقر عملك في دمياط</p>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">📜 الهوية التجارية <button class="action-btn" style="padding:4px 8px; font-size:0.8rem;" onclick="openEditNameModal()">تعديل ✏️</button></div>
                        <div><b>اسم التاجر:</b> ${gameState.playerName}</div>
                        <div><b>المقر الرئيسي:</b> دمياط (محافظات التوزيع)</div>
                        <div><b>المستوى التجاري:</b> Level ${gameState.level}</div>
                        <div><b>إجمالي المبيعات المحققة:</b> ${gameState.totalRevenueGenerated.toLocaleString()} ج.م</div>
                    </div>
                    <div class="info-card">
                        <div class="card-title">📉 الالتزامات الشهرية الدورية</div>
                        <div><b>رواتب الموظفين:</b> ${monthlySalaries.toLocaleString()} ج.م</div>
                        <div><b>صيانة الأسطول:</b> ${monthlyTrucks.toLocaleString()} ج.م</div>
                        <div><b>قسط تسديد القرض:</b> ${monthlyLoan.toLocaleString()} ج.م</div>
                        <div style="border-top:1px solid var(--panel-border); padding-top:5px; margin-top:5px;">
                            <b style="color:var(--accent-red)">إجمالي التكاليف الشهرية:</b> ${totalMonthly.toLocaleString()} ج.م
                        </div>
                    </div>
                    <div class="info-card">
                        <div class="card-title">⚔️ المنافس التجاري (شركة النصر)</div>
                        <div><b>حالة الشركة المنافسة:</b> ${gameState.aiCompetitor.isAcquired ? '<b style="color:var(--accent-green)">تم الاستحواذ والسيطرة ✅</b>' : `<b style="color:var(--accent-red)">حصة السوق: ${gameState.aiCompetitor.share}%</b>`}</div>
                        ${!gameState.aiCompetitor.isAcquired ? `
                            <button class="action-btn buy-btn" onclick="acquireCompetitor()">الاستحواذ والشراء الكامل (3,000,000 ج.م)</button>
                        ` : '<div style="color:var(--accent-green); font-weight:700;">أنت المحتكر الرئيسي لسوق التوزيع الآن!</div>'}
                    </div>
                    <div class="info-card" style="border-color:${gameState.reputation >= 80 ? 'var(--accent-green)' : (gameState.reputation < 30 ? 'var(--accent-red)' : 'var(--panel-border)')};">
                        <div class="card-title">🌟 سمعة الشركة</div>
                        <div><b>المستوى الحالي:</b> ${gameState.reputation} / 100</div>
                        <div class="month-progress-bar" style="width:100%; height:10px;"><div class="month-progress-fill" style="width:${gameState.reputation}%; background:${gameState.reputation >= 80 ? 'var(--accent-green)' : (gameState.reputation < 30 ? 'var(--accent-red)' : 'var(--accent-gold)')};"></div></div>
                        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">
                            ${gameState.reputation >= 80 ? '✅ سمعة ممتازة: أرباح صفقات +15%' : (gameState.reputation < 30 ? '🚨 سمعة سيئة جداً: أرباح -20% وصفقات أقل' : (gameState.reputation < 45 ? '⚠️ سمعة ضعيفة: أرباح -8%' : 'سمعة متوسطة: بدون تأثير'))}
                        </div>
                    </div>
                    <div class="info-card" style="border-color:${gameState.economicCycle.type === 'boom' ? 'var(--accent-green)' : (gameState.economicCycle.type === 'recession' ? 'var(--accent-red)' : 'var(--panel-border)')};">
                        <div class="card-title">📊 حالة الاقتصاد</div>
                        <div>${gameState.economicCycle.type === 'boom' ? '🚀 ازدهار اقتصادي: أرباح الصفقات +30%' : (gameState.economicCycle.type === 'recession' ? '📉 ركود اقتصادي: أرباح الصفقات -25%' : '📊 وضع طبيعي')}</div>
                        ${gameState.economicCycle.type !== 'normal' ? `<div style="font-size:0.78rem; color:var(--text-muted);">يتبقى ${gameState.economicCycle.monthsRemaining} شهر تقريباً</div>` : ''}
                    </div>
                    <div class="info-card" style="border-color:var(--accent-gold);">
                        <div class="card-title">👑 إمبراطورية جديدة (Prestige)</div>
                        <div>مستوى الإمبراطورية الحالي: ${gameState.prestigeLevel || 0}</div>
                        <div>البونص الدائم على كل الأرباح: <b style="color:var(--accent-gold)">+${gameState.prestigeBonus || 0}%</b></div>
                        <div style="font-size:0.78rem; color:var(--text-muted);">الشرط: فتح كل المحافظات + توقيع كل العقود + الاستحواذ على المنافس</div>
                        <button class="action-btn buy-btn" onclick="openPrestigeConfirm()">👑 بدء إمبراطورية تجارية جديدة</button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">📊 نمو إجمالي المبيعات</div>
                        ${buildRevenueChartSVG()}
                    </div>
                </div>
            `;
        }

        else if(tabName === 'map') {
            let html = `<h2>🗺️ خريطة محافظات التوزيع بالجمهورية</h2>
            <p style="color:var(--text-muted); margin-top:5px;">افتح محافظات جديدة لزيادة نسبة أرباحك الصافية من كل صفقة لتوسيع تجارتك</p>
            ${buildGovernorateMapSVG()}
            <div class="card-grid">`;

            gameState.governorates.forEach(g => {
                const isUnlocked = g.unlocked;
                const canUnlock = gameState.level >= g.minLvl;

                html += `
                    <div class="info-card" style="border-color:${isUnlocked ? 'var(--accent-green)' : 'var(--panel-border)'}">
                        <div class="card-title">
                            ${g.name}
                            ${isUnlocked ? '<span class="status-badge badge-owned">مفتوحة للعمل</span>' : '<span class="status-badge badge-locked">مغلقة</span>'}
                        </div>
                        <div><b>مستوى الفتح المطلوب:</b> Level ${g.minLvl}</div>
                        <div><b>علاوة الأرباح:</b> +${g.bonus * 100}% أرباح إضافية</div>
                        <div><b>زمن الرحلة:</b> ${g.deliveryTime} ثانية</div>
                        <div><b>تكلفة فتح المحافظة:</b> ${g.cost.toLocaleString()} ج.م</div>
                        ${isUnlocked && gameState.regionalDemand[g.id] ? `<div style="color:var(--accent-gold); font-weight:800;">📍 الطلب الإقليمي هذا الشهر: ${productNames[gameState.regionalDemand[g.id]] || gameState.regionalDemand[g.id]} (+30% ربح)</div>` : ''}
                        
                        ${!isUnlocked ? `
                            <button class="action-btn buy-btn" 
                                ${!canUnlock ? 'disabled' : ''} 
                                onclick="unlockGovernorate('${g.id}')">
                                ${canUnlock ? 'توسيع التوزيع وشراء التجميع 🚀' : `يتطلب مستوى ${g.minLvl}`}
                            </button>
                        ` : `
                            <div style="color:var(--accent-green); font-weight:700; font-size:0.85rem; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:8px;">✅ مركز التوزيع يعمل بكفاءة</div>
                            ${g.hasBranch ? `
                                <div style="color:var(--accent-blue); font-weight:700; font-size:0.8rem; text-align:center; padding:6px; background:rgba(59,130,246,0.1); border-radius:8px; margin-top:6px;">🏭 مخزن فرعي نشط - شحن أسرع 30% لهذه المحافظة</div>
                            ` : (g.branchCost > 0 ? `
                                <button class="action-btn upgrade-btn" style="margin-top:6px;" onclick="buildBranchWarehouse('${g.id}')">🏭 بناء مخزن فرعي (${g.branchCost.toLocaleString()} ج.م)</button>
                            ` : '')}
                        `}
                    </div>
                `;
            });
            html += `</div>`;
            container.innerHTML = html;
        }

        else if(tabName === 'sales') {
            let repsHtml = '';
            if(gameState.staff.reps.length === 0) {
                repsHtml = `<div style="color:var(--text-muted)">لا يوجد مندوبون مبيعات معينون حالياً. قُم بتعيينهم من إدارة التوظيف!</div>`;
            } else {
                const medals = ['🥇', '🥈', '🥉'];
                const ranked = gameState.staff.reps
                    .map((rep, idx) => ({ rep, idx }))
                    .sort((a, b) => (b.rep.monthSales || 0) - (a.rep.monthSales || 0));

                ranked.forEach((item, rank) => {
                    const rep = item.rep;
                    const idx = item.idx;
                    const xp = rep.xp || 0;
                    const medal = (rep.monthSales || 0) > 0 && medals[rank] ? medals[rank] + ' ' : '';
                    repsHtml += `
                        <div class="info-card">
                            <div class="card-title">${medal}👨‍💼 ${rep.name} (Level ${rep.skill})</div>
                            <div><b>نقاط الخبرة (XP):</b> ${xp} / 100</div>
                            <div class="month-progress-bar" style="width:100%; height:8px;"><div class="month-progress-fill" style="width:${xp}%;"></div></div>
                            <div><b>مبيعات هذا الشهر:</b> ${(rep.monthSales || 0).toLocaleString()} ج.م</div>
                            <div><b>إجمالي مبيعات المندوب:</b> ${rep.totalSales.toLocaleString()} ج.م</div>
                            <div><b>عمولات معلقة غير مصروفة:</b> <b style="color:var(--accent-gold)">${rep.unpaidCommission.toLocaleString()} ج.م</b></div>
                            <button class="action-btn buy-btn" onclick="payCommission(${idx})" ${rep.unpaidCommission <= 0 ? 'disabled' : ''}>صرف العمولة المستحقة 💸</button>
                        </div>
                    `;
                });
            }

            let contractsHtml = '';
            (gameState.clientContracts || []).forEach(c => {
                const percent = Math.round(((c.totalMonths - c.monthsRemaining) / c.totalMonths) * 100);
                contractsHtml += `
                    <div class="info-card" style="border-color:var(--accent-purple);">
                        <div class="card-title">🤝 عقد نشط: ${c.clientName}</div>
                        <div><b>الالتزام الشهري:</b> ${c.qty} كرتونة ${productNames[c.product] || c.product} بسعر ${c.pricePerUnit} ج.م/كرتونة</div>
                        <div><b>الشهور المتبقية:</b> ${c.monthsRemaining} من أصل ${c.totalMonths}</div>
                        <div class="month-progress-bar" style="width:100%; height:8px;"><div class="month-progress-fill" style="width:${percent}%; background:var(--accent-purple);"></div></div>
                        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">تأكد من توفر المخزون كل شهر لتفادي غرامة الإخلال بالعقد!</div>
                    </div>
                `;
            });

            let offersHtml = '';
            (gameState.contractOffers || []).forEach(o => {
                offersHtml += `
                    <div class="info-card" style="border-color:var(--accent-gold);">
                        <div class="card-title">📝 عرض عقد جديد: ${o.clientName}</div>
                        <div><b>المطلوب شهرياً:</b> ${o.qty} كرتونة ${productNames[o.product] || o.product}</div>
                        <div><b>السعر المضمون:</b> ${o.pricePerUnit} ج.م/كرتونة | <b>المدة:</b> ${o.months} أشهر</div>
                        <div style="font-size:0.78rem; color:var(--text-muted);">دخل شهري ثابت ومضمون، بس أقل من متوسط ربح السوق الحر مقابل الأمان</div>
                        <button class="action-btn buy-btn" onclick="acceptContractOffer(${o.id})">توقيع العقد ✍️</button>
                    </div>
                `;
            });

            container.innerHTML = `
                <h2>📈 إدارة المبيعات وأداء المندوبين</h2>
                <p style="color:var(--text-muted); margin-top:5px;">يقوم المندوبون بجلب الصفقات آلياً واكتساب الخبرة للتطور تلقائياً</p>
                <div class="card-grid">${repsHtml}</div>

                <h3 style="margin-top:20px; color:var(--accent-gold);">🤝 عقود العملاء طويلة المدى</h3>
                <p style="color:var(--text-muted); margin-top:5px; font-size:0.85rem;">دخل شهري ثابت مضمون مقابل التزام بكمية وسعر محددين، بدل مخاطرة السوق الحر (حد أقصى عقدين نشطين في نفس الوقت)</p>
                <div class="card-grid">
                    ${contractsHtml || '<div style="color:var(--text-muted)">لا توجد عقود نشطة حالياً.</div>'}
                    ${offersHtml}
                </div>
            `;
        }

        else if(tabName === 'hr') {
            container.innerHTML = `
                <h2>👥 إدارة التوظيف والموارد البشرية</h2>
                <p style="color:var(--text-muted); margin-top:5px;">عين السائقين والمندوبين لتوسيع عمليات التوصيل والبيع</p>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">👨‍✈️ سائق شاحنة نقل</div>
                        <div><b>الوظيفة:</b> قيادة الشاحنات ونقل الصفقات للمحافظات</div>
                        <div><b>الراتب الشهري:</b> 4,000 ج.م / شهر</div>
                        <div><b>تكلفة التعيين الأولى:</b> 5,000 ج.م</div>
                        <div><b>العدد الحالي:</b> ${gameState.staff.drivers} سائقين</div>
                        <button class="action-btn buy-btn" onclick="hireDriver()">تعيين سائق جديد (5,000 ج.م)</button>
                    </div>

                    <div class="info-card">
                        <div class="card-title">👨‍💼 مندوب مبيعات ميداني</div>
                        <div><b>الوظيفة:</b> البحث والتنفيذ التلقائي للصفقات المتاحة</div>
                        <div><b>الراتب الشهري:</b> 3,500 ج.م / شهر + 4% عمولة</div>
                        <div><b>تكلفة التعيين الأولى:</b> 10,000 ج.م</div>
                        <div><b>العدد الحالي:</b> ${gameState.staff.reps.length} مندوبين</div>
                        <button class="action-btn buy-btn" onclick="hireRep()">تعيين مندوب جديد (10,000 ج.م)</button>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'marketing') {
            const m = gameState.marketingLevel;
            container.innerHTML = `
                <h2>📢 إدارة التسويق والعلاقات العامة</h2>
                <p style="color:var(--text-muted); margin-top:5px;">زيادة جودة وحجم وقيمة الصفقات المعروضة عليك بالأسواق</p>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">📣 حملة إعلانية بسيطة (Level 1)</div>
                        <div><b>مضاعف الأرباح:</b> 1.15x على كل صفقة</div>
                        <div><b>التكلفة:</b> 25,000 ج.م</div>
                        <button class="action-btn buy-btn" ${m >= 1 ? 'disabled' : ''} onclick="upgradeMarketing(25000, 1.15)">
                            ${m >= 1 ? 'مفعل حالياً ✅' : 'شراء الحملة الإعلانية'}
                        </button>
                    </div>

                    <div class="info-card">
                        <div class="card-title">🚀 حملة تسويق رقمي شاملة (Level 2)</div>
                        <div><b>مضاعف الأرباح:</b> 1.35x على كل صفقة</div>
                        <div><b>التكلفة:</b> 80,000 ج.م</div>
                        <button class="action-btn buy-btn" ${m >= 2 ? 'disabled' : ''} onclick="upgradeMarketing(80000, 1.35)">
                            ${m >= 2 ? (m > 2 ? 'تجاوزت هذا المستوى ✅' : 'مفعل حالياً ✅') : 'شراء الحملة الإعلانية'}
                        </button>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'finance') {
            const monthlyPayment = gameState.loan > 0 ? Math.min(gameState.loan, 11000) : 0;
            const inv = gameState.investments;

            container.innerHTML = `
                <h2>📑 الحسابات، البنك والبورصة الاستثمارية</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">🏦 القروض والتأمين الشامل</div>
                        <div><b>أصل القرض المتبقي:</b> <b style="color:var(--accent-red)">${gameState.loan.toLocaleString()} ج.م</b></div>
                        <div><b>قسط السداد الشهري:</b> ${monthlyPayment.toLocaleString()} ج.م/شهر</div>
                        <div><b>التأمين على الشحنات:</b> ${gameState.insuranceActive ? '<b style="color:var(--accent-green)">مفعل ✅</b>' : 'غير مفعل ❌'}</div>
                        
                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                            ${gameState.loan > 0 ? `
                                <button class="action-btn danger-btn" onclick="payLoan()">سداد كامل القرض الان (${gameState.loan.toLocaleString()} ج.م)</button>
                            ` : `
                                <button class="action-btn buy-btn" onclick="takeLoan(100000)">سحب قرض 100,000 ج.م</button>
                            `}
                            <button class="action-btn" style="background:var(--accent-purple);" onclick="toggleInsurance()">
                                ${gameState.insuranceActive ? 'إيقاف التأمين' : 'تفعيل خدمة التأمين (15,000 ج.م)'}
                            </button>
                        </div>
                    </div>

                    <div class="info-card">
                        <div class="card-title">📈 الاستثمار الجانبي والأسهم</div>
                        <div><b>أسهم مصانع الألبان:</b> ${inv.dairyShares} أسهم (عائد: ${inv.dairyShares * 3500} ج.م/شهر)</div>
                        <div><b>أسهم شركة اللوجستيات:</b> ${inv.logisticsShares} أسهم (عائد: ${inv.logisticsShares * 8000} ج.م/شهر)</div>
                        <div style="display:flex; gap:5px; margin-top:10px;">
                            <button class="action-btn buy-btn" onclick="buyInvestment('dairyShares', 50000)">شراء سهم ألبان (50,000 ج.م)</button>
                            <button class="action-btn buy-btn" onclick="buyInvestment('logisticsShares', 100000)">شراء سهم لوجستي (100,000 ج.م)</button>
                        </div>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'company') {
            const officeDealsBonus = (gameState.office.level - 1) * 2;
            container.innerHTML = `
                <h2>🏢 مقر الشركة (المقر الرئيسي بدمياط)</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">مقر دمياط الرئيسي</div>
                        <div><b>مستوى التجهيزات:</b> Level ${gameState.office.level}</div>
                        <div><b>طاقة استقبال الصفقات الإضافية:</b> +${officeDealsBonus} صفقة متاحة بالسوق</div>
                        ${!gameState.office.owned ? `
                            <button class="action-btn buy-btn" onclick="buyOffice(150000)">تأسيس المقر (150,000 ج.م)</button>
                        ` : `
                            <button class="action-btn upgrade-btn" onclick="upgradeOffice(100000)">تطوير المكاتب (+2 صفقات إضافية) بـ 100,000 ج.م</button>
                        `}
                    </div>
                </div>
            `;
        }

        else if(tabName === 'tech') {
            const t = gameState.techTree;
            container.innerHTML = `
                <h2>🧠 قسم التقنية الذكية والتطوير</h2>
                <p style="color:var(--text-muted); margin-top:5px;">استثمر في تقنيات ذكية تمنحك أفضلية تنافسية دائمة على السوق</p>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">📱 تطبيق موبايل للطلبات ${t.app ? '<span class="status-badge badge-owned">مفعل</span>' : ''}</div>
                        <div>يزيد عدد الصفقات المعروضة بالسوق في نفس الوقت بمقدار 3 صفقات إضافية.</div>
                        <button class="action-btn buy-btn" ${t.app ? 'disabled' : ''} onclick="buyTechNode('app', 60000)">
                            ${t.app ? 'مفعل بالفعل ✅' : 'تفعيل التطبيق (60,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">📡 نظام تتبع GPS للأسطول ${t.gps ? '<span class="status-badge badge-owned">مفعل</span>' : ''}</div>
                        <div>يقلل زمن وصول جميع الشحنات بنسبة 15% تقريباً بفضل تحسين المسارات.</div>
                        <button class="action-btn buy-btn" ${t.gps ? 'disabled' : ''} onclick="buyTechNode('gps', 80000)">
                            ${t.gps ? 'مفعل بالفعل ✅' : 'تفعيل نظام GPS (80,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🛡️ شركة أمن وحراسة ${t.security ? '<span class="status-badge badge-owned">مفعل</span>' : ''}</div>
                        <div>يحمي شحناتك من الأعطال والتلف العشوائي، ويضمن نجاح أي تفتيش مفاجئ من السلامة.</div>
                        <button class="action-btn buy-btn" ${t.security ? 'disabled' : ''} onclick="buyTechNode('security', 120000)">
                            ${t.security ? 'مفعل بالفعل ✅' : 'التعاقد مع شركة الأمن (120,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card" style="border-color:var(--accent-gold);">
                        <div class="card-title">🏆 إنجاز رواد التكنولوجيا</div>
                        <div>فعّل التقنيات الثلاث معاً للحصول على مكافأة فورية قدرها 150,000 ج.م.</div>
                        <div><b>الحالة:</b> ${gameState.achievements.techMaster ? '<b style="color:var(--accent-green)">تم تحقيقه ✅</b>' : 'قيد الانتظار ⏳'}</div>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'warehouse') {
            const currentStock = (gameState.warehouse.stock.dairy || 0) + (gameState.warehouse.stock.cleaners || 0) + (gameState.warehouse.stock.frozen || 0) + (gameState.warehouse.stock.bakery || 0) + (gameState.warehouse.stock.dryfood || 0) + (gameState.warehouse.stock.cosmetics || 0);
            const p = gameState.marketPrices;
            const productIcons = { dairy: '🥛', cleaners: '🧼', frozen: '❄️', bakery: '🥐', dryfood: '🌾', cosmetics: '💄' };
            const productReqLvl = { dairy: 1, cleaners: 1, frozen: 1, bakery: 2, dryfood: 3, cosmetics: 4 };

            let productsHtml = '';
            if (gameState.warehouse.owned) {
                Object.keys(productNames).forEach(pid => {
                    if (gameState.level < productReqLvl[pid]) return; // لا تظهر منتجات لم يصل مستواك لعقدها بعد
                    const signed = gameState.signedContracts[pid];
                    const autoCfg = gameState.autoReorder[pid] || { enabled: false };

                    let supplierButtons = '';
                    if (signed) {
                        supplierButtons = supplierProfiles.map(s => {
                            const price = Math.round(p[pid] * s.priceMult);
                            const delayLabel = s.arrivalDelay <= 0 ? 'فوري' : `${s.arrivalDelay} ث`;
                            return `<button class="action-btn buy-btn" style="font-size:0.78rem; padding:6px;" onclick="buyStock('${pid}', 50, '${s.id}')">${s.icon} ${s.name}<br>50 كرتونة (${price * 50} ج.م) - ${delayLabel}</button>`;
                        }).join('');
                    }

                    productsHtml += `
                        <div class="info-card">
                            <div class="card-title">${productIcons[pid]} ${productNames[pid]} (السعر الأساسي: ${p[pid]} ج.م)</div>
                            ${signed ? `
                                <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">${supplierButtons}</div>
                                <button class="action-btn" style="margin-top:8px; background:${autoCfg.enabled ? 'var(--accent-green)' : 'var(--panel-border)'}; color:${autoCfg.enabled ? '#000' : 'var(--text-main)'};" onclick="toggleAutoReorder('${pid}')">
                                    🔄 إعادة الطلب التلقائي: ${autoCfg.enabled ? 'مفعّلة ✅ (عند نزول المخزون عن 100)' : 'معطّلة ❌'}
                                </button>
                            ` : `<div style="color:var(--accent-red); font-size:0.85rem;">يجب توقيع عقد ${productNames[pid]} أولاً من تبويب العقود!</div>`}
                        </div>
                    `;
                });
            }

            let shipmentsHtml = '';
            if (gameState.incomingShipments && gameState.incomingShipments.length > 0) {
                gameState.incomingShipments.forEach(s => {
                    const percent = Math.round(((s.totalTime - s.timeLeft) / s.totalTime) * 100);
                    shipmentsHtml += `
                        <div class="info-card" style="margin-top:10px;">
                            <div class="card-title">📥 شحنة واردة: ${productNames[s.product] || s.product} (${s.qty} كرتونة)</div>
                            <div><b>المورد:</b> ${s.supplierName} | <b>الوقت المتبقي:</b> ${s.timeLeft} ثانية</div>
                            <div class="delivery-track">
                                <div class="delivery-track-fill" style="width:${percent}%;"></div>
                                <div class="delivery-truck-icon" style="right:calc(${percent}% - 11px);">📦</div>
                            </div>
                        </div>
                    `;
                });
            }

            container.innerHTML = `
                <h2>🏭 المخزن الرئيسي وبورصة الأسعار</h2>
                <p style="color:var(--text-muted); margin-top:5px;">تتغير أسعار الشراء بالجملة شهرياً حسب البورصة، ولكل منتج 3 موردين: اقتصادي بطيء ومخاطرة أعلى، قياسي متوازن، وفوري غالي بس مضمون فورًا.</p>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">المخزن المركزى (${currentStock} / ${gameState.warehouse.capacity})</div>
                        <div><b>نظام التبريد المتطور:</b> ${gameState.warehouse.hasCoolingSystem ? 'مركب ✅' : 'غير مركب ❌'}</div>
                        <div><b>نظام التحميل الآلي:</b> ${gameState.warehouse.hasAutoLoader ? 'مركب ✅' : 'غير مركب ❌'}</div>
                        
                        ${!gameState.warehouse.owned ? `
                            <button class="action-btn buy-btn" onclick="buyWarehouse(100000, 500)">شراء أول مخزن سعة 500 (100,000 ج.م)</button>
                        ` : `
                            <button class="action-btn upgrade-btn" onclick="expandWarehouseCapacity()">توسعة المخزن (+300) بـ ${WAREHOUSE_EXPAND_COST.toLocaleString()} ج.م</button>
                        `}
                    </div>

                    ${gameState.warehouse.owned ? `
                        <div class="info-card">
                            <div class="card-title">🛠️ ترقيات المخزن التكنولوجية</div>
                            <button class="action-btn buy-btn" ${gameState.warehouse.hasCoolingSystem ? 'disabled' : ''} onclick="buyCoolingSystem()">
                                ${gameState.warehouse.hasCoolingSystem ? 'نظام التبريد مفعل ✅' : 'تركيب نظام تبريد منع التلف (75,000 ج.م)'}
                            </button>
                            <button class="action-btn buy-btn" style="margin-top:5px;" ${gameState.warehouse.hasAutoLoader ? 'disabled' : ''} onclick="buyAutoLoader()">
                                ${gameState.warehouse.hasAutoLoader ? 'نظام التحميل الآلي مفعل ✅' : 'تركيب تحميل آلي -30% وقت (100,000 ج.م)'}
                            </button>
                            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:8px;">💡 نظام التبريد يقلل تلف المخزون الراكد شهرياً للنصف</div>
                        </div>
                    ` : ''}

                    ${productsHtml}
                </div>

                ${shipmentsHtml ? `
                    <h3 style="margin-top:20px; color:var(--accent-gold);">🚚 شحنات في الطريق للمخزن</h3>
                    <div>${shipmentsHtml}</div>
                ` : ''}
            `;
        }

        else if(tabName === 'fleet') {
            let deliveriesHtml = '';
            if(gameState.activeDeliveries.length === 0) {
                deliveriesHtml = `<div style="color:var(--text-muted); margin-top:10px;">لا يوجد أي شاحنات في رحلات توصيل حالياً.</div>`;
            } else {
                gameState.activeDeliveries.forEach(del => {
                    const percent = Math.round(((del.totalTime - del.timeLeft) / del.totalTime) * 100);
                    const truckEmoji = del.truckType === 'refrigerated' ? '❄️' : '🚛';
                    deliveriesHtml += `
                        <div class="info-card" style="margin-top:10px;">
                            <div class="card-title">🚚 رحلة إلى: ${del.govName} (${del.client})</div>
                            <div><b>الوقت المتبقي للوصول:</b> ${del.timeLeft} ثانية</div>
                            <div class="delivery-track">
                                <div class="delivery-track-fill" style="width:${percent}%;"></div>
                                <div class="delivery-truck-icon" style="right:calc(${percent}% - 11px);">${truckEmoji}</div>
                            </div>
                        </div>
                    `;
                });
            }

            container.innerHTML = `
                <h2>🚚 أسطول السيارات ورحلات النقل</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">🚛 شاحنة جامبو (عادية)</div>
                        <div><b>المتاحة الآن:</b> ${getAvailableTrucks('standard')} من أصل ${gameState.trucks}</div>
                        <button class="action-btn buy-btn" onclick="buyTruck('standard')">شراء جامبو (80,000 ج.م)</button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">❄️ شاحنة ثلاجة مبردة</div>
                        <div><b>المتاحة الآن:</b> ${getAvailableTrucks('refrigerated')} من أصل ${gameState.refrigeratedTrucks}</div>
                        <button class="action-btn buy-btn" onclick="buyTruck('refrigerated')">شراء شاحنة ثلاجة (140,000 ج.م)</button>
                    </div>
                </div>
                <h3 style="margin-top:20px; color:var(--accent-gold);">🛣️ رحلات التوصيل الحالية الجارية</h3>
                <div>${deliveriesHtml}</div>
            `;
        }

        else if(tabName === 'contracts') {
            container.innerHTML = `
                <h2>📄 عقود التوريد والشركات المصنعة</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">🥛 عقد توريد ألبان</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.dairy ? 'disabled' : ''} onclick="signContract('dairy', 30000, 1)">
                            ${gameState.signedContracts.dairy ? 'تم التوقيع بنجاح' : 'توقيع العقد (30,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🧼 عقد توريد منظفات</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.cleaners ? 'disabled' : ''} onclick="signContract('cleaners', 60000, 1)">
                            ${gameState.signedContracts.cleaners ? 'تم التوقيع بنجاح' : 'توقيع العقد (60,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">❄️ عقد توريد مجمدات</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.frozen ? 'disabled' : ''} onclick="signContract('frozen', 150000, 1)">
                            ${gameState.signedContracts.frozen ? 'تم التوقيع بنجاح' : 'توقيع العقد (150,000 ج.م)'}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🥐 عقد توريد مخبوزات وحلويات</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">يتطلب المستوى Level 2</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.bakery || gameState.level < 2 ? 'disabled' : ''} onclick="signContract('bakery', 45000, 2)">
                            ${gameState.signedContracts.bakery ? 'تم التوقيع بنجاح' : (gameState.level < 2 ? 'يتطلب Level 2' : 'توقيع العقد (45,000 ج.م)')}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🌾 عقد توريد مواد غذائية وجافة</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">يتطلب المستوى Level 3</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.dryfood || gameState.level < 3 ? 'disabled' : ''} onclick="signContract('dryfood', 75000, 3)">
                            ${gameState.signedContracts.dryfood ? 'تم التوقيع بنجاح' : (gameState.level < 3 ? 'يتطلب Level 3' : 'توقيع العقد (75,000 ج.م)')}
                        </button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">💄 عقد توريد مستحضرات تجميل</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">يتطلب المستوى Level 4</div>
                        <button class="action-btn buy-btn" ${gameState.signedContracts.cosmetics || gameState.level < 4 ? 'disabled' : ''} onclick="signContract('cosmetics', 120000, 4)">
                            ${gameState.signedContracts.cosmetics ? 'تم التوقيع بنجاح' : (gameState.level < 4 ? 'يتطلب Level 4' : 'توقيع العقد (120,000 ج.م)')}
                        </button>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'deals') {
            let dealsHtml = '';
            if(!gameState.office.owned) {
                dealsHtml = `<div style="color:var(--accent-red); font-weight:700;">يجب شراء وتأسيس المقر الرئيسي بدمياط لتلقي الصفقات!</div>`;
            } else if(gameState.marketDeals.length === 0) {
                dealsHtml = `<div style="color:var(--text-muted)">جاري بحث السوق... تظهر صفقات جديدة كل 6 ثوانٍ!</div>`;
            } else {
                let sortedDeals = [...gameState.marketDeals];
                if (gameState.dealsSortMode === 'revenue') {
                    sortedDeals.sort((a, b) => b.totalRevenue - a.totalRevenue);
                } else if (gameState.dealsSortMode === 'expiry') {
                    sortedDeals.sort((a, b) => (a.isRush ? a.rushTimer : 999) - (b.isRush ? b.rushTimer : 999));
                }

                sortedDeals.forEach(deal => {
                    const reqTruck = deal.reqTruck || 'standard';
                    const hasStock = (gameState.warehouse.stock[deal.product] || 0) >= deal.qty;
                    const hasTruck = getAvailableTrucks(reqTruck) > 0;
                    const hasDriver = gameState.staff.drivers > gameState.activeDeliveries.length;
                    const canExecute = hasStock && hasTruck && hasDriver;
                    const truckNameStr = reqTruck === 'refrigerated' ? '❄️ شاحنة مبردة' : '🚛 جامبو عادية';
                    const isSelected = selectedDealIds.has(deal.id);
                    const canNegotiate = deal.totalRevenue >= 60000 && !deal.negotiated;

                    dealsHtml += `
                        <div class="info-card" style="${deal.isRush ? 'border-color:var(--accent-red); background:rgba(239, 68, 68, 0.05);' : (deal.isExport ? 'border-color:var(--accent-purple);' : '')} ${isSelected ? 'box-shadow: 0 0 0 2px var(--accent-blue);' : ''}">
                            <div class="card-title">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.95rem;">
                                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleDealSelection(${deal.id})" style="width:16px; height:16px; cursor:pointer;" />
                                    🤝 ${deal.client}
                                </label>
                            </div>
                            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                                ${deal.isRush ? `<span class="status-badge badge-rush">⚡ عاجل (${deal.rushTimer}ث)</span>` : ''}
                                ${deal.isVip ? `<span class="status-badge badge-vip">⭐ عميل دائم</span>` : ''}
                                ${deal.isExport ? `<span class="status-badge" style="background:rgba(139,92,246,0.2); color:var(--accent-purple); border:1px solid var(--accent-purple);">🌍 تصدير دولي</span>` : ''}
                                ${deal.isRegional ? `<span class="status-badge" style="background:rgba(16,185,129,0.2); color:var(--accent-green); border:1px solid var(--accent-green);">📍 طلب إقليمي مرتفع</span>` : ''}
                            </div>
                            <div><b>المحافظة:</b> ${deal.govName} | <b>المنتج:</b> ${deal.productName}</div>
                            <div><b>الكمية:</b> ${deal.qty} كرتونة | <b>الشاحنة:</b> ${truckNameStr}</div>
                            <div><b>إجمالي القيمة:</b> <b style="color:var(--accent-green)">${deal.totalRevenue.toLocaleString()} ج.م</b></div>
                            <button class="action-btn buy-btn" ${!canExecute ? 'disabled' : ''} onclick="executeManualDeal(${deal.id})">
                                ${!hasStock ? 'البضاعة غير متوفرة' : (!hasTruck ? 'لا تملك شاحنة متاحة' : (!hasDriver ? 'لا يوجد سائق' : 'قبول وشحن الطلب 🚚'))}
                            </button>
                            ${canNegotiate ? `<button class="action-btn" style="background:var(--accent-purple); color:#fff; margin-top:6px;" onclick="negotiateDeal(${deal.id})">🤝 فاوض على السعر (صفقة كبيرة)</button>` : ''}
                        </div>
                    `;
                });
            }

            let seasonHeader = gameState.activeSeason ? `<div style="padding:10px; background:rgba(245, 158, 11, 0.2); border:1px solid var(--accent-gold); border-radius:10px; margin-bottom:15px; color:var(--accent-gold); font-weight:800;">🔥 ${gameState.activeSeason.name} مفعل حالياً! زيادة أرباح المبيعات.</div>` : '';

            const sortBtn = (mode, label) => `<button class="action-btn" style="flex:1; background:${gameState.dealsSortMode === mode ? 'var(--accent-gold)' : 'var(--panel-bg)'}; color:${gameState.dealsSortMode === mode ? '#000' : 'var(--text-main)'}; border:1.5px solid var(--panel-border);" onclick="setDealsSortMode('${mode}')">${label}</button>`;

            container.innerHTML = `
                <h2>🤝 السوق والصفقات الحية</h2>
                ${seasonHeader}
                <div style="display:flex; gap:8px; margin-bottom:12px;">
                    ${sortBtn('default', '⏱️ الأحدث')}
                    ${sortBtn('revenue', '💰 الأعلى ربحاً')}
                    ${sortBtn('expiry', '⚡ الأقرب انتهاءً')}
                </div>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; padding:10px; background:rgba(59, 130, 246, 0.08); border:1.5px dashed var(--accent-blue); border-radius:10px;">
                    <span style="font-size:0.85rem; color:var(--text-muted);">📦 اختر صفقتين أو أكثر لنفس المحافظة ونفس نوع الشاحنة لشحنهم برحلة واحدة (${selectedDealIds.size} مختارة)</span>
                    <button class="action-btn buy-btn" style="margin-top:0; width:auto; padding:8px 16px;" ${selectedDealIds.size < 2 ? 'disabled' : ''} onclick="executeBundledDeals()">شحن مجمّع 🚚</button>
                </div>
                <div class="card-grid">${dealsHtml}</div>
            `;
        }

        else if(tabName === 'quests') {
            let questHtml = '';
            if (gameState.monthlyQuest) {
                const q = gameState.monthlyQuest;
                questHtml = `
                    <div class="info-card" style="border-color:var(--accent-gold);">
                        <div class="card-title">🎯 المهمة الشهرية الحالية</div>
                        <div><b>الهدف:</b> ${q.title}</div>
                        <div><b>التقدم:</b> ${q.current} / ${q.target} شحنات</div>
                        <div><b>المكافأة:</b> <b style="color:var(--accent-green)">${q.reward.toLocaleString()} ج.م</b></div>
                        <div><b>الحالة:</b> ${q.completed ? '<b style="color:var(--accent-green)">مكتملة وحُصلت المكافأة ✅</b>' : 'قيد التنفيذ ⏳'}</div>
                    </div>
                `;
            }

            const ach = gameState.achievements;
            container.innerHTML = `
                <h2>🎯 المهام الشهرية والإنجازات</h2>
                <div class="card-grid">
                    ${questHtml}
                    <div class="info-card">
                        <div class="card-title">🏆 نادي المليونير</div>
                        <div>تحقيق إجمالي مبيعات 1,000,000 ج.م</div>
                        <div><b>المكافأة:</b> 100,000 ج.م</div>
                        <div><b>الحالة:</b> ${ach.firstMillion ? 'محتفل به ✅' : 'لم يتحقق بعد ❌'}</div>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🏆 ملك الطريق</div>
                        <div>امتلاك أسطول مكون من 5 شاحنات</div>
                        <div><b>المكافأة:</b> 50,000 ج.م</div>
                        <div><b>الحالة:</b> ${ach.fleetOwner ? 'محتفل به ✅' : 'لم يتحقق بعد ❌'}</div>
                    </div>
                </div>
            `;
        }

        else if(tabName === 'settings') {
            container.innerHTML = `
                <h2>🛡️ حماية البيانات وإدارة التقدم</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">💾 الحفظ والاسترجاع</div>
                        <button class="action-btn buy-btn" onclick="saveGameData(true)">حفظ التقدم الآن 💾</button>
                    </div>
                    <div class="info-card">
                        <div class="card-title">🔑 كود التصدير والاستيراد</div>
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <button class="action-btn" style="flex:1;" onclick="openExportModal()">تصدير الكود 📤</button>
                            <button class="action-btn" style="flex:1; background:var(--accent-purple);" onclick="openImportModal()">استيراد كود 📥</button>
                        </div>
                    </div>
                    <div class="info-card" style="border-color:var(--accent-red);">
                        <div class="card-title" style="color:var(--accent-red);">⚠️ البدء من جديد</div>
                        <button class="action-btn danger-btn" onclick="openResetConfirmModal()">إعادة ضبط اللعبة 🗑️</button>
                    </div>
                </div>
            `;
        }
    }
    window.showTab = showTab;
})();