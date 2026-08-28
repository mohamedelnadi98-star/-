(function() {
    const GAME_VERSION = "3.0.0";
    const SAVE_KEY_PRIMARY = 'trader_real_save_v5';
    const SAVE_KEY_BACKUP = 'trader_real_save_backup_v5';
    const MONTH_DURATION_SECONDS = 3600; 
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

    const governoratesData = [
        { id: 'domyat', name: 'دمياط (المقر الرئيسي)', minLvl: 1, cost: 0, unlocked: true, bonus: 0, deliveryTime: 10 },
        { id: 'dakahlia', name: 'الدقهلية (المنصورة)', minLvl: 2, cost: 120000, unlocked: false, bonus: 0.20, deliveryTime: 15 },
        { id: 'sharqia', name: 'الشرقية (الزقازيق)', minLvl: 3, cost: 250000, unlocked: false, bonus: 0.20, deliveryTime: 20 },
        { id: 'cairo', name: 'القاهرة الكبرى', minLvl: 4, cost: 500000, unlocked: false, bonus: 0.30, deliveryTime: 30 },
        { id: 'alex', name: 'الإسكندرية', minLvl: 5, cost: 800000, unlocked: false, bonus: 0.35, deliveryTime: 35 }
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
            techMaster: false
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
        taxDue: 0
    };

    let gameState = JSON.parse(JSON.stringify(defaultGameState));
    const clientNames = ["سوبرماركت التقوى", "هايبر الأمل", "أسواق مكة", "ماركت الأمانة", "سلسلة الجملة", "ميني ماركت البركة", "أسواق المدينة", "هايبر الفيروز", "ماركت النور", "أسواق الهدى"];

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
                if (!gameState.marketPrices) gameState.marketPrices = { ...baseProductPrices };
                if (!gameState.vipClients) gameState.vipClients = {};
                if (!gameState.achievements) gameState.achievements = { firstMillion: false, fleetOwner: false, allGovs: false, techMaster: false };
                if (!gameState.techTree) gameState.techTree = { app: false, gps: false, security: false };
                if (!gameState.investments) gameState.investments = { dairyShares: 0, logisticsShares: 0 };
                
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
        loadGameData(false).then(hasSaved => {
            if(!hasSaved) {
                document.getElementById('name-modal').classList.remove('hidden');
                document.getElementById('player-name-input').focus();
            }
        });
    });

    window.addEventListener('beforeunload', () => { saveGameData(false); });

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
            }

            processDeliveries();
            runAIReps();
            checkLevelProgress();
            updateRushDealsTimer();
            checkAchievements();

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
            showToast(`📈 حصلت على أرباح استثمارات شهرية قدرها ${passiveIncome.toLocaleString()} ج.م!`, "success");
        }

        // إقرار ضريبي كل 6 أشهر
        if (gameState.month % 6 === 0) {
            const tax = Math.round(gameState.totalRevenueGenerated * 0.05);
            gameState.money = Math.max(0, gameState.money - tax);
            showToast(`🏛️ تم خصم الإقرار الضريبي الدوري بـ ${tax.toLocaleString()} ج.م من الخزينة.`, "info");
        }
    }

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

                if (delivery.client) {
                    gameState.vipClients[delivery.client] = (gameState.vipClients[delivery.client] || 0) + 1;
                }

                if (delivery.repIndex !== undefined && gameState.staff.reps[delivery.repIndex]) {
                    let rep = gameState.staff.reps[delivery.repIndex];
                    let commission = Math.round(finalRev * 0.04);
                    rep.unpaidCommission += commission;
                    rep.totalSales += finalRev;
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

        if (!gameState.aiCompetitor.isAcquired && gameState.governorates.filter(g => g.unlocked).length < 3) {
            gameState.aiCompetitor.share = Math.min(40, gameState.aiCompetitor.share + 2);
        }

        document.getElementById('game-month').innerText = gameState.month;
        updateUI();
        
        let loanMsg = loanPayment > 0 ? ` وشملت سداد قسط قرض بقيمة ${loanPayment.toLocaleString()} ج.م` : '';
        showToast(`📆 انتهى الشهر ${gameState.month - 1}! الخصم الدوري: ${totalExpenses.toLocaleString()} ج.م.${loanMsg}`, loanPayment > 0 ? "info" : "error");
        
        if (gameState.currentTab === 'admin' || gameState.currentTab === 'finance') showTab(gameState.currentTab);
    }

    function generateMarketDeal() {
        if (!gameState.office.owned) return;
        
        let maxDeals = 6 + (gameState.marketingLevel * 2);
        if (gameState.techTree.app) maxDeals += 3; // تطبيق الموبايل يزود الصفقات المتاحة

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
        const client = clientNames[Math.floor(Math.random() * clientNames.length)];
        
        const vipLevel = gameState.vipClients[client] || 0;
        const vipBonus = vipLevel > 5 ? 0.25 : (vipLevel > 2 ? 0.10 : 0);

        let seasonBonus = 0;
        if (gameState.activeSeason && gameState.activeSeason.bonusProd === prod.id) {
            seasonBonus = gameState.activeSeason.multiplier - 1;
        }

        const isRush = Math.random() < 0.25; 
        const rushMultiplier = isRush ? 1.8 : 1.0;

        if (isRush) AudioEngine.playAlertSound();

        const qty = (Math.floor(Math.random() * 5) + 1) * 50; 
        const priceVariance = Math.floor(Math.random() * 7) - 2; 
        let pricePerUnit = prod.baseSell + priceVariance;

        let baseDeliveryTime = selectedGov.deliveryTime;
        if (gameState.warehouse.hasAutoLoader) baseDeliveryTime = Math.round(baseDeliveryTime * 0.7);
        if (gameState.techTree.gps) baseDeliveryTime = Math.round(baseDeliveryTime * 0.85); // نظام GPS يقلل زمه الشحن
        
        let totalRev = Math.round(qty * pricePerUnit * gameState.marketingMultiplier * (1 + selectedGov.bonus + vipBonus + seasonBonus) * rushMultiplier);

        const newDeal = {
            id: Date.now(),
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
            isVip: vipLevel >= 3
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
                        id: Date.now(),
                        client: deal.client,
                        govId: deal.govId,
                        govName: deal.govName,
                        totalRevenue: deal.totalRevenue,
                        timeLeft: deal.deliveryTime,
                        totalTime: deal.deliveryTime,
                        repIndex: repIndex,
                        truckType: reqTruck
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
            showToast("🏆 إنجاز جديد: نادي المليونير! حصلت على مكافأة 100,000 ج.م", "success");
        }
        if (!gameState.achievements.fleetOwner && (gameState.trucks + gameState.refrigeratedTrucks) >= 5) {
            gameState.achievements.fleetOwner = true;
            gameState.money += 50000;
            showToast("🏆 إنجاز جديد: ملك الطريق! امتلاك 5 شاحنات. مكافأة 50,000 ج.م", "success");
        }
        if (!gameState.achievements.techMaster && gameState.techTree.app && gameState.techTree.gps && gameState.techTree.security) {
            gameState.achievements.techMaster = true;
            gameState.money += 150000;
            showToast("🏆 إنجاز جديد: رواد التكنولوجيا! تم شراء كافة التقنيات الذكية. مكافأة 150,000 ج.م", "success");
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
        await saveGameData(false);
        const dataStr = JSON.stringify(gameState);
        const code = btoa(encodeURIComponent(dataStr));
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
                await saveGameData(false);
                updateUI();
                closeModal('import-code-modal');
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
        document.getElementById('dashboard-screen').classList.add('hidden');
        document.getElementById('name-modal').classList.remove('hidden');
        document.getElementById('player-name-input').value = "";
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
        let icon = type === "success" ? "✅" : (type === "error" ? "⚠️" : "🔔");
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-100%)';
            toast.style.transition = 'all 0.5s ease';
            setTimeout(() => toast.remove(), 500);
        }, 3200);
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

    window.buyStock = function(product, count) {
        const pricePerUnit = gameState.marketPrices[product] || baseProductPrices[product];
        const totalCost = pricePerUnit * count;
        const currentStock = (gameState.warehouse.stock.dairy || 0) + (gameState.warehouse.stock.cleaners || 0) + (gameState.warehouse.stock.frozen || 0) + (gameState.warehouse.stock.bakery || 0) + (gameState.warehouse.stock.dryfood || 0) + (gameState.warehouse.stock.cosmetics || 0);
        
        if(currentStock + count > gameState.warehouse.capacity) return showToast("المخزن لا يتسع لهذه الكمية!", "error");
        if(gameState.money < totalCost) return showToast("الرصيد غير كاف لشراء البضاعة!", "error");

        gameState.money -= totalCost;
        gameState.warehouse.stock[product] = (gameState.warehouse.stock[product] || 0) + count;
        updateUI();
        showToast(`📦 تم شراء ${count} كرتونة بسعر البورصة (${pricePerUnit} ج.م)!`, "success");
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
            id: Date.now(),
            client: deal.client,
            govId: deal.govId,
            govName: deal.govName,
            totalRevenue: deal.totalRevenue,
            timeLeft: deal.deliveryTime,
            totalTime: deal.deliveryTime,
            truckType: reqTruck
        });

        gameState.marketDeals.splice(dealIndex, 1);
        AudioEngine.playTruckSound();

        updateUI();
        showToast(`🚚 خرجت الشاحنة لتوصيل الطلب إلى ${deal.govName}! مدة الرحلة: ${deal.deliveryTime} ثوانٍ`);
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
                </div>
            `;
        }

        else if(tabName === 'map') {
            let html = `<h2>🗺️ خريطة محافظات التوزيع بالجمهورية</h2>
            <p style="color:var(--text-muted); margin-top:5px;">افتح محافظات جديدة لزيادة نسبة أرباحك الصافية من كل صفقة لتوسيع تجارتك</p>
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
                        
                        ${!isUnlocked ? `
                            <button class="action-btn buy-btn" 
                                ${!canUnlock ? 'disabled' : ''} 
                                onclick="unlockGovernorate('${g.id}')">
                                ${canUnlock ? 'توسيع التوزيع وشراء التجميع 🚀' : `يتطلب مستوى ${g.minLvl}`}
                            </button>
                        ` : `<div style="color:var(--accent-green); font-weight:700; font-size:0.85rem; text-align:center; padding:8px; background:rgba(16,185,129,0.1); border-radius:8px;">✅ مركز التوزيع يعمل بكفاءة</div>`}
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
                gameState.staff.reps.forEach((rep, idx) => {
                    const xp = rep.xp || 0;
                    repsHtml += `
                        <div class="info-card">
                            <div class="card-title">👨‍💼 ${rep.name} (Level ${rep.skill})</div>
                            <div><b>نقاط الخبرة (XP):</b> ${xp} / 100</div>
                            <div class="month-progress-bar" style="width:100%; height:8px;"><div class="month-progress-fill" style="width:${xp}%;"></div></div>
                            <div><b>إجمالي مبيعات المندوب:</b> ${rep.totalSales.toLocaleString()} ج.م</div>
                            <div><b>عمولات معلقة غير مصروفة:</b> <b style="color:var(--accent-gold)">${rep.unpaidCommission.toLocaleString()} ج.م</b></div>
                            <button class="action-btn buy-btn" onclick="payCommission(${idx})" ${rep.unpaidCommission <= 0 ? 'disabled' : ''}>صرف العمولة المستحقة 💸</button>
                        </div>
                    `;
                });
            }

            container.innerHTML = `
                <h2>📈 إدارة المبيعات وأداء المندوبين</h2>
                <p style="color:var(--text-muted); margin-top:5px;">يقوم المندوبون بجلب الصفقات آلياً واكتساب الخبرة للتطور تلقائياً</p>
                <div class="card-grid">${repsHtml}</div>
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
            container.innerHTML = `
                <h2>🏢 مقر الشركة (المقر الرئيسي بدمياط)</h2>
                <div class="card-grid">
                    <div class="info-card">
                        <div class="card-title">مقر دمياط الرئيسي</div>
                        <div><b>مستوى التجهيزات:</b> Level ${gameState.office.level}</div>
                        ${!gameState.office.owned ? `
                            <button class="action-btn buy-btn" onclick="buyOffice(150000)">تأسيس المقر (150,000 ج.م)</button>
                        ` : `
                            <button class="action-btn upgrade-btn" onclick="upgradeOffice(100000)">تطوير المكاتب والتجهيزات (100,000 ج.م)</button>
                        `}
                    </div>
                </div>
            `;
        }

        else if(tabName === 'warehouse') {
            const currentStock = (gameState.warehouse.stock.dairy || 0) + (gameState.warehouse.stock.cleaners || 0) + (gameState.warehouse.stock.frozen || 0) + (gameState.warehouse.stock.bakery || 0) + (gameState.warehouse.stock.dryfood || 0) + (gameState.warehouse.stock.cosmetics || 0);
            const p = gameState.marketPrices;

            container.innerHTML = `
                <h2>🏭 المخزن الرئيسي وبورصة الأسعار</h2>
                <p style="color:var(--text-muted); margin-top:5px;">تتغير أسعار الشراء بالجملة شهرياً حسب البورصة - اشترِ عند الانخفاض!</p>
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
                        </div>

                        <div class="info-card">
                            <div class="card-title">🥛 ألبان (السعر الحالي: ${p.dairy} ج.م)</div>
                            ${gameState.signedContracts.dairy ? `
                                <button class="action-btn buy-btn" onclick="buyStock('dairy', 50)">شراء 50 كرتونة (${p.dairy * 50} ج.م)</button>
                            ` : `<div style="color:var(--accent-red); font-size:0.85rem;">يجب توقيع عقد الألبان أولاً!</div>`}
                        </div>

                        <div class="info-card">
                            <div class="card-title">🧼 منظفات (السعر الحالي: ${p.cleaners} ج.م)</div>
                            ${gameState.signedContracts.cleaners ? `
                                <button class="action-btn buy-btn" onclick="buyStock('cleaners', 50)">شراء 50 كرتونة (${p.cleaners * 50} ج.م)</button>
                            ` : `<div style="color:var(--accent-red); font-size:0.85rem;">يجب توقيع عقد المنظفات أولاً!</div>`}
                        </div>

                        <div class="info-card">
                            <div class="card-title">❄️ مجمدات (السعر الحالي: ${p.frozen} ج.م)</div>
                            ${gameState.signedContracts.frozen ? `
                                <button class="action-btn buy-btn" onclick="buyStock('frozen', 50)">شراء 50 كرتونة (${p.frozen * 50} ج.م)</button>
                            ` : `<div style="color:var(--accent-red); font-size:0.85rem;">يجب توقيع عقد المجمدات أولاً!</div>`}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        else if(tabName === 'fleet') {
            let deliveriesHtml = '';
            if(gameState.activeDeliveries.length === 0) {
                deliveriesHtml = `<div style="color:var(--text-muted); margin-top:10px;">لا يوجد أي شاحنات في رحلات توصيل حالياً.</div>`;
            } else {
                gameState.activeDeliveries.forEach(del => {
                    const percent = Math.round(((del.totalTime - del.timeLeft) / del.totalTime) * 100);
                    deliveriesHtml += `
                        <div class="info-card" style="margin-top:10px;">
                            <div class="card-title">🚚 رحلة إلى: ${del.govName} (${del.client})</div>
                            <div><b>الوقت المتبقي للوصول:</b> ${del.timeLeft} ثانية</div>
                            <div class="month-progress-bar" style="width:100%; height:12px; margin-top:5px;">
                                <div class="month-progress-fill" style="width:${percent}%;"></div>
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
                gameState.marketDeals.forEach(deal => {
                    const reqTruck = deal.reqTruck || 'standard';
                    const hasStock = (gameState.warehouse.stock[deal.product] || 0) >= deal.qty;
                    const hasTruck = getAvailableTrucks(reqTruck) > 0;
                    const hasDriver = gameState.staff.drivers > gameState.activeDeliveries.length;
                    const canExecute = hasStock && hasTruck && hasDriver;
                    const truckNameStr = reqTruck === 'refrigerated' ? '❄️ شاحنة مبردة' : '🚛 جامبو عادية';

                    dealsHtml += `
                        <div class="info-card" style="${deal.isRush ? 'border-color:var(--accent-red); background:rgba(239, 68, 68, 0.05);' : ''}">
                            <div class="card-title">
                                🤝 طلب من: ${deal.client}
                                ${deal.isRush ? `<span class="status-badge badge-rush">⚡ عاجل (${deal.rushTimer}ث)</span>` : ''}
                                ${deal.isVip ? `<span class="status-badge badge-vip">⭐ عميل دائم</span>` : ''}
                            </div>
                            <div><b>المحافظة:</b> ${deal.govName} | <b>المنتج:</b> ${deal.productName}</div>
                            <div><b>الكمية:</b> ${deal.qty} كرتونة | <b>الشاحنة:</b> ${truckNameStr}</div>
                            <div><b>إجمالي القيمة:</b> <b style="color:var(--accent-green)">${deal.totalRevenue.toLocaleString()} ج.م</b></div>
                            <button class="action-btn buy-btn" ${!canExecute ? 'disabled' : ''} onclick="executeManualDeal(${deal.id})">
                                ${!hasStock ? 'البضاعة غير متوفرة' : (!hasTruck ? 'لا تملك شاحنة متاحة' : (!hasDriver ? 'لا يوجد سائق' : 'قبول وشحن الطلب 🚚'))}
                            </button>
                        </div>
                    `;
                });
            }

            let seasonHeader = gameState.activeSeason ? `<div style="padding:10px; background:rgba(245, 158, 11, 0.2); border:1px solid var(--accent-gold); border-radius:10px; margin-bottom:15px; color:var(--accent-gold); font-weight:800;">🔥 ${gameState.activeSeason.name} مفعل حالياً! زيادة أرباح المبيعات.</div>` : '';

            container.innerHTML = `
                <h2>🤝 السوق والصفقات الحية</h2>
                ${seasonHeader}
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