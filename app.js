import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Data Models & Constants
const DEFAULT_CATEGORIES = {
    expense: [
        { id: 'e1', label: 'Ăn uống', icon: '🍜' },
        { id: 'e2', label: 'Di chuyển', icon: '🚗' },
        { id: 'e3', label: 'Nhà ở', icon: '🏠' },
        { id: 'e4', label: 'Sức khỏe', icon: '💊' },
        { id: 'e5', label: 'Giải trí', icon: '🎮' },
        { id: 'e6', label: 'Mua sắm', icon: '👔' },
        { id: 'e7', label: 'Học tập', icon: '📚' },
        { id: 'e8', label: 'Du lịch', icon: '✈️' },
        { id: 'e9', label: 'Hóa đơn', icon: '💡' },
        { id: 'e10', label: 'Quà tặng', icon: '🎁' },
        { id: 'e11', label: 'Tiết kiệm', icon: '💰' },
        { id: 'e12', label: 'Khác', icon: '➕' }
    ],
    income: [
        { id: 'i1', label: 'Lương', icon: '💼' },
        { id: 'i2', label: 'Đầu tư', icon: '💹' },
        { id: 'i3', label: 'Thưởng', icon: '🎯' },
        { id: 'i4', label: 'Freelance', icon: '🤝' },
        { id: 'i5', label: 'Quà', icon: '🎁' },
        { id: 'i6', label: 'Khác', icon: '➕' }
    ]
};

// Utilities
let currentCurrency = 'VND'; // Default
let formatMoney = (amount) => {
    if (currentCurrency === 'USD') {
        const usdRate = 25000;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / usdRate);
    }
    if (currentCurrency === 'EUR') {
        const eurRate = 27000;
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount / eurRate);
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' ? '<i class="ph ph-check-circle text-green"></i>' : '<i class="ph ph-warning-circle text-red"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// State Management
let transactions = [];
let categories = {};
let investments = [];
let investmentTransactions = [];
let priceHistory = [];

const initData = () => {
    // Show a loading or empty state temporarily if needed
    
    // Listen to Categories
    const catDocRef = doc(db, 'settings', 'categories');
    onSnapshot(catDocRef, (snapshot) => {
        if (snapshot.exists()) {
            categories = snapshot.data();
        } else {
            // Document doesn't exist, create default
            categories = DEFAULT_CATEGORIES;
            setDoc(catDocRef, categories);
        }
        if(window.location.hash !== '#categories') renderDashboard();
    });

    // Listen to Transactions
    const txQuery = query(collection(db, 'transactions'), orderBy('date', 'desc'));
    onSnapshot(txQuery, (snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => {
            transactions.push({ ...doc.data(), id: doc.id });
        });
        renderDashboard();
        if(document.getElementById('full-history-list')) renderHistory();
    });
    
    // Listen to Investments
    onSnapshot(collection(db, 'investments'), (snapshot) => {
        investments = [];
        snapshot.forEach((doc) => {
            investments.push({ ...doc.data(), id: doc.id });
        });
        renderInvestments();
        renderDashboard();
    });

    onSnapshot(collection(db, 'investmentTransactions'), (snapshot) => {
        investmentTransactions = [];
        snapshot.forEach((doc) => {
            investmentTransactions.push({ ...doc.data(), id: doc.id });
        });
        renderInvestments();
    });
};

// Navigation
const initNavigation = () => {
    const links = document.querySelectorAll('.nav-item, .view-all');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            if(!targetId) return;
            
            if(link.classList.contains('nav-item')) {
                document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                pageTitle.innerText = link.innerText.trim();
            } else {
                document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
                const targetNavLink = document.querySelector(`.nav-item[data-target="${targetId}"]`);
                if(targetNavLink) {
                    targetNavLink.classList.add('active');
                    pageTitle.innerText = targetNavLink.innerText.trim();
                }
            }
            
            pages.forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            if (targetId === 'dashboard') renderDashboard();
            if (targetId === 'investments') renderInvestments();
        });
    });
};

// Dashboard Logic
const animateValue = (obj, start, end, duration) => {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(easeProgress * (end - start) + start);
        obj.innerHTML = formatMoney(current);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = formatMoney(end);
        }
    };
    window.requestAnimationFrame(step);
};

let mainChartInstance = null;
let doughnutChartInstance = null;

const renderDashboard = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let monthIncome = 0;
    let monthExpense = 0;
    
    let prevMonthIncome = 0;
    let prevMonthExpense = 0;
    
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        const m = txDate.getMonth();
        const y = txDate.getFullYear();
        
        if (tx.type === 'income') totalIncome += tx.amount;
        else totalExpense += tx.amount;

        if (m === currentMonth && y === currentYear) {
            if (tx.type === 'income') monthIncome += tx.amount;
            else monthExpense += tx.amount;
        } else if (m === prevMonth && y === prevYear) {
            if (tx.type === 'income') prevMonthIncome += tx.amount;
            else prevMonthExpense += tx.amount;
        }
    });
    
    const totalBalance = totalIncome - totalExpense;

    // Investment Net value hook
    let invCurrentVal = 0;
    let invTotalCost = 0;
    investments.forEach(inv => {
        const stats = calculateAssetStats(inv);
        invCurrentVal += stats.currentValue;
        invTotalCost += stats.totalCost;
    });
    const invPL = invCurrentVal - invTotalCost;
    const invPLPercent = invTotalCost > 0 ? (invPL / invTotalCost) * 100 : 0;

    const totalNetWorth = totalBalance + invCurrentVal;

    // Comparisons
    const calcDiff = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const incDiff = calcDiff(monthIncome, prevMonthIncome);
    const expDiff = calcDiff(monthExpense, prevMonthExpense);

    document.getElementById('kpi-income-compare').innerText = `${Math.abs(incDiff)}%`;
    document.getElementById('kpi-expense-compare').innerText = `${Math.abs(expDiff)}%`;
    
    document.getElementById('kpi-income-compare').parentElement.innerHTML = 
        `<i class="ph ph-trend-${incDiff >= 0 ? 'up' : 'down'}"></i> <span id="kpi-income-compare">${Math.abs(incDiff)}%</span> so với tháng trước`;
        
    document.getElementById('kpi-expense-compare').parentElement.innerHTML = 
        `<i class="ph ph-trend-${expDiff >= 0 ? 'up' : 'down'}"></i> <span id="kpi-expense-compare">${Math.abs(expDiff)}%</span> so với tháng trước`;

    const kpiInc = document.getElementById('kpi-income');
    const kpiExp = document.getElementById('kpi-expense');
    const kpiBal = document.getElementById('kpi-balance');
    const kpiTx = document.getElementById('kpi-tx-count');
    
    animateValue(kpiInc, 0, monthIncome, 800);
    animateValue(kpiExp, 0, monthExpense, 800);
    animateValue(kpiBal, 0, totalNetWorth, 800);

    const kpiInvVal = document.getElementById('kpi-inv-value');
    const kpiInvPl = document.getElementById('kpi-inv-pl');
    animateValue(kpiInvVal, 0, invCurrentVal, 800);
    
    kpiInvPl.innerText = `${invPL >= 0 ? '+' : ''}${invPLPercent.toFixed(2)}%`;
    kpiInvPl.style.color = invPL >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    
    let startTimestamp = null;
    const animateTx = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const p = Math.min((timestamp - startTimestamp) / 800, 1);
        const cur = Math.floor((1 - Math.pow(1 - p, 4)) * transactions.length);
        kpiTx.innerHTML = cur;
        if (p < 1) requestAnimationFrame(animateTx);
        else kpiTx.innerHTML = transactions.length;
    };
    requestAnimationFrame(animateTx);

    document.getElementById('current-month-label').innerText = `Tháng ${currentMonth + 1}, ${currentYear}`;
    document.getElementById('current-month-expense').innerText = formatMoney(monthExpense);

    const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('header-date').innerText = now.toLocaleDateString('vi-VN', dateOpts);

    renderRecentTransactions();
    renderCharts();
};

const renderCharts = () => {
    Chart.defaults.color = '#7a7a8a';
    Chart.defaults.font.family = "'Nunito', sans-serif";
    
    const lineCtx = document.getElementById('mainChart').getContext('2d');
    const monthNames = [];
    const incomes = [];
    const expenses = [];
    
    let now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthNames.push(`T${d.getMonth() + 1}`);
        
        let mInc = 0, mExp = 0;
        transactions.forEach(tx => {
            const txD = new Date(tx.date);
            if(txD.getMonth() === d.getMonth() && txD.getFullYear() === d.getFullYear()) {
                if(tx.type === 'income') mInc += tx.amount;
                else mExp += tx.amount;
            }
        });
        incomes.push(mInc);
        expenses.push(mExp);
    }

    if (mainChartInstance) mainChartInstance.destroy();
    
    mainChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: monthNames,
            datasets: [
                {
                    label: 'Thu nhập',
                    data: incomes,
                    borderColor: '#3dd68c',
                    backgroundColor: 'rgba(61, 214, 140, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Chi tiêu',
                    data: expenses,
                    borderColor: '#f75f5f',
                    backgroundColor: 'rgba(247, 95, 95, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { position: 'top', align: 'end' },
                tooltip: {
                    backgroundColor: 'rgba(18, 18, 26, 0.9)',
                    titleColor: '#c9a84c',
                    bodyColor: '#f0eeea',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += formatMoney(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            return value / 1000000 + 'M';
                        }
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    const doughnutCtx = document.getElementById('doughnutChart').getContext('2d');
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const catTotals = {};
    transactions.forEach(tx => {
        const txDate = new Date(tx.date);
        if(tx.type === 'expense' && txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            catTotals[tx.categoryLabel] = (catTotals[tx.categoryLabel] || 0) + tx.amount;
        }
    });
    
    const dLabels = Object.keys(catTotals);
    const dData = Object.values(catTotals);
    
    const combined = dLabels.map((lbl, i) => ({ lbl, val: dData[i] })).sort((a,b) => b.val - a.val);
    
    const topLabels = combined.slice(0, 5).map(x => x.lbl);
    const topData = combined.slice(0, 5).map(x => x.val);
    
    if(combined.length > 5) {
        topLabels.push('Khác');
        topData.push(combined.slice(5).reduce((a,b) => a + b.val, 0));
    }

    if(doughnutChartInstance) doughnutChartInstance.destroy();

    const chartColors = ['#c9a84c', '#4f8ef7', '#3dd68c', '#ab6bff', '#ff8a5c', '#7a7a8a'];

    doughnutChartInstance = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
            labels: topLabels.length ? topLabels : ['Chưa có dữ liệu'],
            datasets: [{
                data: topData.length ? topData : [1],
                backgroundColor: topData.length ? chartColors : ['#2a2a35'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'right' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if(!topData.length) return 'Chưa có dữ liệu';
                            const val = formatMoney(context.parsed);
                            return ` ${context.label}: ${val}`;
                        }
                    }
                }
            }
        }
    });
};

const timeSince = (dateInput) => {
    const date = new Date(dateInput);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
};

const renderRecentTransactions = () => {
    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';
    
    const recent = transactions.slice(0, 5);
    
    if(recent.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Chưa có giao dịch nào.</p>`;
        return;
    }
    
    recent.forEach(tx => {
        const isExp = tx.type === 'expense';
        const colorClass = isExp ? 'text-red' : 'text-green';
        const sign = isExp ? '-' : '+';
        
        list.innerHTML += `
            <div class="transaction-item">
                <div class="tx-left">
                    <div class="tx-icon">${tx.categoryIcon}</div>
                    <div class="tx-details">
                        <h4>${tx.title}</h4>
                        <p>${tx.categoryLabel} ${tx.note ? '• ' + tx.note : ''}</p>
                    </div>
                </div>
                <div class="tx-right">
                    <div class="tx-amount ${colorClass}">${sign}${formatMoney(tx.amount)}</div>
                    <div class="tx-time">${timeSince(tx.date)}</div>
                </div>
            </div>
        `;
    });
};

const initAddTransaction = () => {
    document.getElementById('tx-date').value = new Date().toISOString().slice(0, 16);
    
    const amountInput = document.getElementById('tx-amount');
    
    amountInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value === '') {
            e.target.value = '';
            return;
        }
        e.target.value = new Intl.NumberFormat('vi-VN').format(value);
    });

    document.querySelectorAll('.btn-quick').forEach(btn => {
        btn.addEventListener('click', () => {
            const addVal = parseInt(btn.innerText.replace(/\D/g, '')) * 1000;
            let currentVal = parseInt(amountInput.value.replace(/\D/g, '')) || 0;
            currentVal += addVal;
            amountInput.value = new Intl.NumberFormat('vi-VN').format(currentVal);
        });
    });

    const typeRadios = document.querySelectorAll('input[name="tx-type"]');
    typeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            renderCategoryPicker(radio.value);
        });
    });
    
    renderCategoryPicker('expense');
    
    document.getElementById('transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveTransaction();
    });
};

const renderCategoryPicker = (type) => {
    const grid = document.getElementById('category-grid-picker');
    grid.innerHTML = '';
    
    const catList = categories[type] || [];
    catList.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'cat-item';
        item.dataset.id = cat.id;
        item.innerHTML = `
            <div class="cat-icon">${cat.icon}</div>
            <div class="cat-label">${cat.label}</div>
        `;
        
        item.addEventListener('click', () => {
            document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            document.getElementById('tx-category').value = cat.id;
        });
        
        grid.appendChild(item);
    });
    
    if(grid.firstChild) {
        grid.firstChild.click();
    }
};

const saveTransaction = () => {
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const amountStr = document.getElementById('tx-amount').value.replace(/\D/g, '');
    const amount = parseInt(amountStr);
    
    if(!amount || amount <= 0) {
        showToast('Vui lòng nhập số tiền hợp lệ!', 'error');
        return;
    }
    
    const categoryId = document.getElementById('tx-category').value;
    const date = document.getElementById('tx-date').value;
    const title = document.getElementById('tx-title').value.trim();
    const note = document.getElementById('tx-note').value.trim();
    const paymentMethod = document.querySelector('input[name="tx-payment"]:checked').value;
    
    const catDetails = categories[type].find(c => c.id === categoryId);
    
    const tags = [];
    const hashRegex = /#[\w\u00C0-\u1EF9]+/g;
    let match;
    while ((match = hashRegex.exec(note)) !== null) {
        tags.push(match[0].substring(1));
    }

    const tx = {
        type,
        amount,
        category: categoryId,
        categoryIcon: catDetails.icon,
        categoryLabel: catDetails.label,
        title,
        note,
        tags,
        paymentMethod,
        date: new Date(date).toISOString(),
        createdAt: new Date().toISOString()
    };
    
    addDoc(collection(db, 'transactions'), tx).then(() => {
        showToast('Lưu giao dịch thành công!');
        
        document.getElementById('transaction-form').reset();
        document.getElementById('tx-date').value = new Date().toISOString().slice(0, 16);
        document.getElementById('tx-amount').value = '';
        renderCategoryPicker(type);
        
        document.querySelector('.nav-item[data-target="dashboard"]').click();
    }).catch(err => {
        console.error("Error adding document: ", err);
        showToast('Lỗi khi lưu giao dịch!', 'error');
    });
};

const initReports = () => {
    document.getElementById('prev-period').addEventListener('click', () => {
        if (reportType === 'month') {
            reportCurrentDate.setMonth(reportCurrentDate.getMonth() - 1);
        } else {
            reportCurrentDate.setFullYear(reportCurrentDate.getFullYear() - 1);
        }
        renderReports();
    });

    document.getElementById('next-period').addEventListener('click', () => {
        if (reportType === 'month') {
            reportCurrentDate.setMonth(reportCurrentDate.getMonth() + 1);
        } else {
            reportCurrentDate.setFullYear(reportCurrentDate.getFullYear() + 1);
        }
        renderReports();
    });

    const periodRadios = document.querySelectorAll('input[name="report-period"]');
    periodRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            reportType = e.target.value;
            reportCurrentDate = new Date();
            renderReports();
        });
    });

    document.querySelector('.nav-item[data-target="reports"]').addEventListener('click', () => {
        renderReports();
    });
};

let reportCurrentDate = new Date();
let reportType = 'month'; // 'month' or 'year'

let reportLineChartInstance = null;
let reportDoughnutChartInstance = null;

const renderReports = () => {
    const isMonth = reportType === 'month';
    const currentM = reportCurrentDate.getMonth();
    const currentY = reportCurrentDate.getFullYear();
    
    const labelOpts = isMonth 
        ? { month: 'long', year: 'numeric' } 
        : { year: 'numeric' };
    const labelStr = reportCurrentDate.toLocaleDateString('vi-VN', labelOpts);
    document.getElementById('report-period-label').innerText = labelStr.charAt(0).toUpperCase() + labelStr.slice(1);

    let periodTx = transactions.filter(tx => {
        const d = new Date(tx.date);
        if (isMonth) return d.getMonth() === currentM && d.getFullYear() === currentY;
        return d.getFullYear() === currentY;
    });

    let totalInc = 0;
    let totalExp = 0;
    
    const catTotals = {};
    const trendMap = {};

    periodTx.forEach(tx => {
        if (tx.type === 'income') {
            totalInc += tx.amount;
        } else {
            totalExp += tx.amount;
            catTotals[tx.categoryLabel] = (catTotals[tx.categoryLabel] || 0) + tx.amount;
            
            const d = new Date(tx.date);
            const key = isMonth ? d.getDate() : d.getMonth() + 1;
            trendMap[key] = (trendMap[key] || 0) + tx.amount;
        }
    });

    const savings = totalInc - totalExp;
    const savingsRate = totalInc > 0 ? Math.round((savings / totalInc) * 100) : 0;

    document.getElementById('report-total-income').innerText = formatMoney(totalInc);
    document.getElementById('report-total-expense').innerText = formatMoney(totalExp);
    document.getElementById('report-total-savings').innerText = formatMoney(savings);
    document.getElementById('report-savings-rate').innerText = `${savingsRate}%`;

    Chart.defaults.color = '#7a7a8a';
    Chart.defaults.font.family = "'Nunito', sans-serif";

    let lineLabels = [];
    let lineData = [];
    if (isMonth) {
        const daysInMonth = new Date(currentY, currentM + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            lineLabels.push(i);
            lineData.push(trendMap[i] || 0);
        }
    } else {
        for (let i = 1; i <= 12; i++) {
            lineLabels.push(`T${i}`);
            lineData.push(trendMap[i] || 0);
        }
    }

    const lineCtx = document.getElementById('reportLineChart').getContext('2d');
    if (reportLineChartInstance) reportLineChartInstance.destroy();
    reportLineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: lineLabels,
            datasets: [{
                label: 'Chi tiêu',
                data: lineData,
                borderColor: '#c9a84c',
                backgroundColor: 'rgba(201, 168, 76, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    const dLabels = Object.keys(catTotals);
    const dData = Object.values(catTotals);
    const combined = dLabels.map((lbl, i) => ({ lbl, val: dData[i] })).sort((a,b) => b.val - a.val);
    
    const topLabels = combined.slice(0, 5).map(x => x.lbl);
    const topData = combined.slice(0, 5).map(x => x.val);
    if(combined.length > 5) {
        topLabels.push('Khác');
        topData.push(combined.slice(5).reduce((a,b) => a + b.val, 0));
    }

    const doughnutCtx = document.getElementById('reportDoughnutChart').getContext('2d');
    if (reportDoughnutChartInstance) reportDoughnutChartInstance.destroy();
    
    const chartColors = ['#c9a84c', '#4f8ef7', '#3dd68c', '#ab6bff', '#ff8a5c', '#7a7a8a'];
    
    reportDoughnutChartInstance = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
            labels: topLabels.length ? topLabels : ['Trống'],
            datasets: [{
                data: topData.length ? topData : [1],
                backgroundColor: topData.length ? chartColors : ['#2a2a35'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initData();
    initNavigation();
    initAddTransaction();
    initReports();
    initSettings();
    initHistory();
    initCategoriesPage();
    renderDashboard();
    renderInvestments();
});

// Settings logic
const initSettings = () => {
    const savedSetting = localStorage.getItem('finwise_settings');
    if (savedSetting) {
        const s = JSON.parse(savedSetting);
        if (s.currency) {
            currentCurrency = s.currency;
            document.getElementById('setting-currency').value = currentCurrency;
        }
    }

    document.getElementById('setting-currency').addEventListener('change', (e) => {
        currentCurrency = e.target.value;
        const s = savedSetting ? JSON.parse(savedSetting) : {};
        s.currency = currentCurrency;
        localStorage.setItem('finwise_settings', JSON.stringify(s));
        showToast('Đã lưu tiền tệ!');
        renderDashboard(); 
    });

    document.getElementById('btn-export-data').addEventListener('click', () => {
        const data = {
            transactions,
            categories,
            settings: { currency: currentCurrency }
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finwise_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Xuất dữ liệu thành công!');
    });

    document.getElementById('btn-clear-data').addEventListener('click', () => {
        showToast('Tính năng xoá toàn bộ dữ liệu đám mây bị khoá để bảo vệ an toàn dữ liệu.', 'error');
    });

    window.seedFirebase = async () => {
        showToast('Đang tạo dữ liệu mẫu lên Firebase...');
        const mockTxs = [];
        const today = new Date();
        for (let i = 0; i < 20; i++) {
            const isExpense = Math.random() > 0.3;
            const type = isExpense ? 'expense' : 'income';
            const catArr = categories[type] || [];
            if (catArr.length === 0) continue;
            const cat = catArr[Math.floor(Math.random() * catArr.length)];
            const date = new Date(today);
            date.setDate(today.getDate() - Math.floor(Math.random() * 60));
            mockTxs.push({
                type,
                amount: isExpense ? Math.floor(Math.random() * 1000000) + 50000 : Math.floor(Math.random() * 10000000) + 2000000,
                category: cat.id,
                categoryIcon: cat.icon,
                categoryLabel: cat.label,
                title: `Giao dịch mẫu ${i+1}`,
                note: 'Dữ liệu phát sinh',
                tags: [],
                paymentMethod: 'cash',
                date: date.toISOString(),
                createdAt: new Date().toISOString()
            });
        }
        
        for (const tx of mockTxs) {
            await addDoc(collection(db, 'transactions'), tx);
        }
        
        showToast('Hoàn tất tạo dữ liệu mẫu!');
    };

    document.getElementById('btn-export-pdf').addEventListener('click', () => {
        showToast('Tính năng xuất PDF đang được phát triển.', 'error');
    });
};

// History Logic
const initHistory = () => {
    document.getElementById('history-search').addEventListener('input', renderHistory);
    document.getElementById('history-type-filter').addEventListener('change', renderHistory);

    document.querySelector('.nav-item[data-target="history"]').addEventListener('click', renderHistory);
};

window.deleteTransaction = (id) => {
    if (confirm('Xoá giao dịch này?')) {
        deleteDoc(doc(db, 'transactions', id)).then(() => {
            showToast('Đã xoá giao dịch.');
        }).catch(err => {
            console.error("Error deleting document: ", err);
            showToast('Lỗi khi xoá!', 'error');
        });
    }
};

const renderHistory = () => {
    const list = document.getElementById('full-history-list');
    const q = document.getElementById('history-search').value.toLowerCase();
    const typeObj = document.getElementById('history-type-filter').value;

    let filtered = transactions;

    if (typeObj !== 'all') {
        filtered = filtered.filter(t => t.type === typeObj);
    }

    if (q) {
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(q) || 
            t.categoryLabel.toLowerCase().includes(q) ||
            (t.note && t.note.toLowerCase().includes(q))
        );
    }

    list.innerHTML = '';

    if (filtered.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding: 20px; color: var(--text-muted);">Không tìm thấy giao dịch.</p>`;
        return;
    }

    filtered.forEach(tx => {
        const isExp = tx.type === 'expense';
        const colorClass = isExp ? 'text-red' : 'text-green';
        const sign = isExp ? '-' : '+';
        
        list.innerHTML += `
            <div class="transaction-item">
                <div class="tx-left">
                    <div class="tx-icon">${tx.categoryIcon}</div>
                    <div class="tx-details">
                        <h4>${tx.title}</h4>
                        <p>${tx.categoryLabel} ${tx.note ? '• ' + tx.note : ''}</p>
                    </div>
                </div>
                <div class="tx-right" style="display:flex; align-items:center; gap: 16px;">
                    <div style="text-align:right;">
                        <div class="tx-amount ${colorClass}">${sign}${formatMoney(tx.amount)}</div>
                        <div class="tx-time">${new Date(tx.date).toLocaleDateString('vi-VN', {day:'numeric', month:'short'})}</div>
                    </div>
                    <button class="btn-icon" onclick="deleteTransaction('${tx.id}')"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;
    });
};

// Categories Logic
const initCategoriesPage = () => {
    document.getElementById('add-category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.getElementById('new-cat-type').value;
        const icon = document.getElementById('new-cat-icon').value.trim();
        const label = document.getElementById('new-cat-name').value.trim();

        if(!icon || !label) return;

        const newCat = {
            id: 'c_' + Date.now(),
            label,
            icon
        };

        if(!categories[type]) categories[type] = [];
        categories[type].push(newCat);
        
        setDoc(doc(db, 'settings', 'categories'), categories).then(() => {
            showToast('Thêm danh mục thành công!');
            document.getElementById('add-category-form').reset();
            
            renderCategoriesManager();
            if(document.querySelector('input[name="tx-type"]:checked')) {
                renderCategoryPicker(document.querySelector('input[name="tx-type"]:checked').value);
            }
        }).catch(err => {
            console.error("Error saving category: ", err);
            showToast('Lỗi khi thêm danh mục!', 'error');
        });
    });

    document.querySelector('.nav-item[data-target="categories"]').addEventListener('click', renderCategoriesManager);
};

window.deleteCategory = (type, id) => {
    const inUse = transactions.some(t => t.type === type && t.category === id);
    if (inUse) {
        showToast('Danh mục đang được sử dụng, không thể xoá!', 'error');
        return;
    }

    if(confirm('Xoá danh mục này?')) {
        categories[type] = categories[type].filter(c => c.id !== id);
        setDoc(doc(db, 'settings', 'categories'), categories).then(() => {
            renderCategoriesManager();
            showToast('Đã xoá danh mục.');
        }).catch(err => {
            console.error(err);
            showToast('Lỗi khi xoá danh mục!', 'error');
        });
    }
};

const renderCategoriesManager = () => {
    const list = document.getElementById('category-manager-list');
    list.innerHTML = '';

    const allCats = [
        ...categories.expense.map(c => ({...c, catType: 'expense'})),
        ...categories.income.map(c => ({...c, catType: 'income'}))
    ];

    allCats.forEach(c => {
        list.innerHTML += `
            <div class="cat-manage-item">
                <button class="btn-icon btn-delete-cat" onclick="deleteCategory('${c.catType}', '${c.id}')"><i class="ph ph-trash"></i></button>
                <div class="cat-icon">${c.icon}</div>
                <div class="cat-label">${c.label}</div>
                <div class="text-sm" style="color: ${c.catType === 'expense' ? 'var(--accent-red)' : 'var(--accent-green)'}">
                    ${c.catType === 'expense' ? 'Chi' : 'Thu'}
                </div>
            </div>
        `;
    });
};

// --- INVESTMENT MODULE (Phase 7) ---

const calculateAssetStats = (inv) => {
    const relatedTx = investmentTransactions.filter(tx => tx.investmentId === inv.id);
    let totalCost = 0;
    
    relatedTx.forEach(tx => {
        if (tx.action === 'buy') {
            totalCost += tx.total;
        } 
    });
    
    const currentVal = inv.quantity * inv.currentPrice;
    return { totalCost, currentValue: currentVal };
};

const renderInvestments = () => {
    let invTotalCost = 0;
    let invCurrentVal = 0;
    
    const listContainer = document.getElementById('asset-list-container');
    if (!listContainer) return; 
    listContainer.innerHTML = '';
    
    if(investments.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Bạn chưa có tài sản đầu tư nào.</p>';
    }
    
    investments.forEach(inv => {
        const stats = calculateAssetStats(inv);
        invTotalCost += stats.totalCost;
        invCurrentVal += stats.currentValue;
        
        const pl = stats.currentValue - stats.totalCost;
        const plPercent = stats.totalCost > 0 ? (pl / stats.totalCost) * 100 : 0;
        const plColorClass = pl >= 0 ? 'text-green' : 'text-red';
        const plSign = pl >= 0 ? '+' : '';
        
        listContainer.innerHTML += `
            <div class="asset-item glass-card" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03);">
                <div style="display:flex; gap:16px; align-items:center;">
                    <div class="asset-icon" style="font-size:32px; width:48px; text-align:center;">${inv.icon}</div>
                    <div class="asset-info">
                        <h4 style="margin:0; font-size:16px; color:#f0eeea;">${inv.name} <span style="font-size:12px; padding:2px 6px; background:rgba(255,255,255,0.1); border-radius:4px; margin-left:8px;">${inv.symbol}</span></h4>
                        <p style="margin:4px 0 0 0; color:var(--text-muted); font-size:14px;">${inv.platform} • ${inv.quantity}</p>
                    </div>
                </div>
                <div class="asset-values" style="text-align: right;">
                    <h4 class="${plColorClass}" style="margin:0; font-size:16px;">${formatMoney(stats.currentValue)}</h4>
                    <p style="margin:4px 0; color:var(--text-muted); font-size:13px;">Vốn: ${formatMoney(stats.totalCost)}</p>
                    <p class="${plColorClass}" style="margin:0; font-size:13px; font-weight:600;">${plSign}${plPercent.toFixed(2)}%</p>
                </div>
            </div>
        `;
    });
    
    const totalPl = invCurrentVal - invTotalCost;
    const totalRoi = invTotalCost > 0 ? (totalPl / invTotalCost) * 100 : 0;
    
    document.getElementById('inv-total-cost').innerText = formatMoney(invTotalCost);
    document.getElementById('inv-current-value').innerText = formatMoney(invCurrentVal);
    
    const plEl = document.getElementById('inv-total-pl');
    plEl.innerText = `${totalPl >= 0 ? '+' : ''}${formatMoney(totalPl)}`;
    plEl.style.color = totalPl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    
    const roiEl = document.getElementById('inv-total-roi');
    roiEl.innerText = `${totalPl >= 0 ? '+' : ''}${totalRoi.toFixed(2)}%`;
    roiEl.style.color = totalPl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    
    document.getElementById('inv-asset-count').innerText = investments.length;
    
    renderInvestmentCharts();
    renderInvestmentInsights(invTotalCost, invCurrentVal, totalRoi);
};

let invLineChartInstance = null;
let invDoughnutChartInstance = null;

const renderInvestmentCharts = () => {
    Chart.defaults.color = '#7a7a8a';
    Chart.defaults.font.family = "'Nunito', sans-serif";
    
    const dCtx = document.getElementById('invDoughnutChart').getContext('2d');
    const allocation = {};
    investments.forEach(inv => {
        const stats = calculateAssetStats(inv);
        allocation[inv.name] = (allocation[inv.name] || 0) + stats.currentValue;
    });
    
    const labels = Object.keys(allocation);
    const data = Object.values(allocation);
    const chartColors = ['#c9a84c', '#4f8ef7', '#3dd68c', '#ab6bff', '#ff8a5c'];
    
    if (invDoughnutChartInstance) invDoughnutChartInstance.destroy();
    invDoughnutChartInstance = new Chart(dCtx, {
        type: 'doughnut',
        data: {
            labels: labels.length ? labels : ['Trống'],
            datasets: [{
                data: data.length ? data : [1],
                backgroundColor: data.length ? chartColors : ['#2a2a35'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { position: 'right' } }
        }
    });
    
    const lCtx = document.getElementById('invLineChart').getContext('2d');
    if (invLineChartInstance) invLineChartInstance.destroy();
    
    const mockM = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
    const mockD = [0, 5, -2, 10, 8, 15]; 
    
    invLineChartInstance = new Chart(lCtx, {
        type: 'line',
        data: {
            labels: mockM,
            datasets: [{
                label: 'Lợi nhuận theo tháng (%)',
                data: mockD,
                borderColor: '#ab6bff',
                backgroundColor: 'rgba(171, 107, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
};

const renderInvestmentInsights = (totalCost, currentVal, roi) => {
    const container = document.getElementById('inv-insights-container');
    container.innerHTML = '';
    
    if(investments.length === 0) return;
    
    const diversityCount = new Set(investments.map(i => i.type)).size;
    let msg1 = diversityCount < 2 
        ? 'Danh mục đang tập trung vào quá ít loại tài sản. Hãy đa dạng hóa để giảm rủi ro.' 
        : 'Tuyệt vời! Danh mục được đa dạng hóa tốt.';
    
    let msg2 = roi < 0 
        ? 'Thị trường đang điều chỉnh. Xem xét trung bình giá (DCA) các tài sản dài hạn.' 
        : (roi > 15 ? 'Sinh lời tốt! Cân nhắc chốt lời một phần để bảo toàn vốn.' : 'Tài sản tăng trưởng ổn định. Tiếp tục giữ chiến lược hiện tại.');
    
    container.innerHTML = `
        <div class="insight-item" style="display:flex; gap:16px; margin-top:16px; align-items:center; background:rgba(255,255,255,0.03); padding:16px; border-radius:12px;">
            <div class="insight-icon text-blue" style="font-size:32px;"><i class="ph ph-shield-check"></i></div>
            <div class="insight-content">
                <h4 style="margin:0; font-size:16px; color:#f0eeea;">Mức độ đa dạng hoá</h4>
                <p style="margin:4px 0 0 0; color:var(--text-muted); font-size:14px;">${msg1}</p>
            </div>
        </div>
        <div class="insight-item" style="display:flex; gap:16px; margin-top:16px; align-items:center; background:rgba(255,255,255,0.03); padding:16px; border-radius:12px;">
            <div class="insight-icon ${roi >= 0 ? 'text-green' : 'text-gold'}" style="font-size:32px;"><i class="ph ph-trend-up"></i></div>
            <div class="insight-content">
                <h4 style="margin:0; font-size:16px; color:#f0eeea;">Hiệu suất sinh lời</h4>
                <p style="margin:4px 0 0 0; color:var(--text-muted); font-size:14px;">${msg2}</p>
            </div>
        </div>
    `;
};

window.openAddAssetModal = () => {
    showToast('Tính năng thêm tài sản đang được phát triển.', 'error');
};
