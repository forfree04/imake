/* ==========================================================
   [주문 / 더치페이 / 정산 로직]
   ========================================================== */

function startQRScan() {
    if (currentTable) {
        navigateTo('order-menu');
    } else {
        navigateTo('order-table');
    }
}

function inputNum(val) {
    if (val === 'C') currentTable = "";
    else if (val === 'BS') currentTable = currentTable.slice(0, -1);
    else if (currentTable.length < 2) currentTable += val;

    document.getElementById('ticketDisplay').innerText = currentTable || "--";
}

function checkTableNum() {
    if (!currentTable) return alert("테이블 번호를 입력해주세요.");
    if (!confirm(`테이블 번호 ${currentTable}번이 맞습니까?`)) return;

    if (confirm("더치페이(Dutch Pay) 모드를 사용하시겠습니까?\n\n[확인] 더치페이 모드 (1/N 공유 기능 활성화)\n[취소] 일반 모드 (통합 결제)")) {
        isDutchMode = true;
    } else {
        isDutchMode = false;
    }

    document.getElementById('headerTableNum').innerText = `(Table ${currentTable})${isDutchMode ? ' [Dutch]' : ''}`;
    document.getElementById('floatTableNum').innerText = currentTable;
    renderOrderMenu();
    navigateTo('order-menu');
}

function renderOrderMenu() {
    const list = document.getElementById('orderMenuList');
    if (!list) return;

    const langKey = currentLang;
    const isPaid = userMembershipType === 'paid';

    list.innerHTML = menuData.map(m => {
        const name = m.name[langKey] || m.name['en'];
        const originalPrice = m.price;
        const memberPrice = Math.floor(originalPrice * 0.95);
        const myQty = cart[m.id] || 0;
        const sharedQty = cart['s-' + m.id] || 0;

        let priceHtml = '';
        if (isPaid) {
            priceHtml = `<div style="color:#aaa; font-size:12px; text-decoration:line-through;">₩ ${originalPrice.toLocaleString()}</div><div style="color:#ef4444; font-weight:bold;">₩ ${memberPrice.toLocaleString()} <span style="font-size:10px; background:#fee2e2; padding:2px 4px; border-radius:4px;">PASS</span></div>`;
        } else {
            priceHtml = `<div style="font-weight:bold;">₩ ${originalPrice.toLocaleString()}</div><div style="color:#ef4444; font-size:11px;">Member Price: ₩ ${memberPrice.toLocaleString()} (5% ↓)</div>`;
        }

        return `
        <div class="menu-item">
            <img src="${m.img}" class="menu-img">
            <div class="menu-info">
                <div style="font-size:15px; font-weight:bold;">${escapeHTML(name)}</div>
                <div style="margin-bottom:6px;">${priceHtml}</div>

                ${isDutchMode ? `
                <label style="display:flex; align-items:center; gap:4px; font-size:12px; color:#3b82f6; margin-bottom:4px; cursor:pointer; width:fit-content;">
                    <input type="checkbox" id="share-check-${m.id}" style="accent-color:#3b82f6;">
                    <span>1/N Share</span>
                </label>` : ''}

                <div class="qty-ctrl">
                    <button class="qty-btn" onclick="updateQty(${m.id}, -1)">-</button>
                    <span id="qty-${m.id}" style="width:40px; text-align:center; font-weight:bold; font-size:13px;">${myQty}${sharedQty > 0 ? ` <span style="color:#3b82f6;">(+${sharedQty})</span>` : ''}</span>
                    <button class="qty-btn" onclick="updateQty(${m.id}, 1)">+</button>
                </div>
            </div>
        </div>`;
    }).join('');

    calcTotal();
}

function updateQty(id, chg) {
    let isShared = false;
    const checkEl = document.getElementById(`share-check-${id}`);
    if (checkEl) isShared = checkEl.checked;
    const key = isShared ? 's-' + id : id;

    if (!cart[key]) cart[key] = 0;
    cart[key] += chg;
    if (cart[key] < 0) cart[key] = 0;

    const myQty = cart[id] || 0;
    const sharedQty = cart['s-' + id] || 0;
    document.getElementById(`qty-${id}`).innerHTML = `${myQty}${sharedQty > 0 ? ` <span style="color:#3b82f6;">(+${sharedQty})</span>` : ''}`;
    calcTotal();
}

function calcTotal() {
    let total = 0;
    let count = 0;
    for (let id in cart) {
        const realId = String(id).startsWith('s-') ? id.substring(2) : id;
        const m = menuData.find(x => x.id == realId);
        if (!m) continue;
        const price = (userMembershipType === 'paid') ? Math.floor(m.price * 0.95) : m.price;
        total += price * cart[id];
        count += cart[id];
    }
    document.getElementById('totalPrice').innerText = total.toLocaleString();
    document.getElementById('btnOrder').disabled = count === 0;
    return total;
}

function openOrderSummary() {
    let html = `<h3>Confirm Order</h3><div style="text-align:left; margin-top:20px; max-height:50vh; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior: contain;">`;
    const langKey = currentLang;
    const isPaid = userMembershipType === 'paid';

    for (let id in cart) {
        if (cart[id] > 0) {
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            const name = m.name[langKey] || m.name['en'];
            const price = isPaid ? Math.floor(m.price * 0.95) : m.price;
            html += `<div class="bill-list-item" style="${isShared ? 'color:#3b82f6' : ''}"><span>${isShared ? '[Shared] ' : ''}${escapeHTML(name)} x ${cart[id]}</span><span>₩ ${(price * cart[id]).toLocaleString()}</span></div>`;
        }
    }
    html += `</div><div class="bill-total"><span>Total</span><span style="color:#ef4444;">₩ ${calcTotal().toLocaleString()}</span></div>`;
    html += `<div style="display:flex; gap:10px; margin-top:20px;"><button onclick="closeModal('modal-bill')" style="flex:1; padding:12px; background:#eee; border:none; border-radius:8px; cursor:pointer;">Cancel</button><button onclick="submitOrder()" style="flex:1; padding:12px; background:#3b82f6; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Submit</button></div>`;

    document.getElementById('bill-body').innerHTML = html;
    document.getElementById('modal-bill').style.display = 'flex';
}

function openBillModal() {
    let totalOriginal = 0;
    let totalPaid = 0;

    let myTotal = 0;
    let sharedTotal = 0;

    const isPaid = userMembershipType === 'paid';
    const getPrice = (p) => isPaid ? Math.floor(p * 0.95) : p;

    let html = `<h3>Bill (Table ${currentTable})</h3><div style="text-align:left; margin-top:20px; max-height:50vh; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior: contain;">`;

    if (confirmedOrders.length > 0) {
        const batches = {};
        confirmedOrders.forEach((item, idx) => {
            const bid = item.batchId || 'prev';
            if (!batches[bid]) batches[bid] = [];
            batches[bid].push({ ...item, originalIdx: idx });
        });

        const batchKeys = Object.keys(batches).sort();
        batchKeys.forEach((bid, idx) => {
            html += `<div style="font-size:12px; color:#888; margin:10px 0 5px; border-bottom:1px solid #eee;">Order #${idx + 1}</div>`;
            batches[bid].forEach(item => {
                const itemPrice = getPrice(item.price);
                const sum = itemPrice * item.qty;
                totalOriginal += item.price * item.qty;
                totalPaid += sum;

                if (item.isShared) sharedTotal += sum;
                else myTotal += sum;

                const name = item.name[currentLang] || item.name['en'];
                html += `<div class="bill-list-item" style="${item.isShared ? 'color:#3b82f6' : ''}">
                    <span>${item.isShared ? '<i data-lucide="users" style="width:12px"></i> ' : ''}${escapeHTML(name)} x ${item.qty}</span>
                    <span>₩ ${sum.toLocaleString()}</span>
                </div>`;
            });
        });
    }

    let cartHasItems = false;
    let cartHtml = '';
    for (let id in cart) {
        if (cart[id] > 0) {
            cartHasItems = true;
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);
            const itemPrice = getPrice(m.price);
            const sum = itemPrice * cart[id];
            totalOriginal += m.price * cart[id];
            totalPaid += sum;

            if (isShared) sharedTotal += sum;
            else myTotal += sum;

            const name = m.name[currentLang] || m.name['en'];
            cartHtml += `<div class="bill-list-item" style="color:${isShared ? '#3b82f6' : '#888'};"><span>[New] ${isShared ? '(Shared) ' : ''}${escapeHTML(name)} x ${cart[id]}</span><span>₩ ${sum.toLocaleString()}</span></div>`;
        }
    }

    if (cartHasItems) {
        html += `<div style="font-size:12px; color:#3b82f6; margin:15px 0 5px; border-bottom:1px solid #3b82f6;">New (In Cart)</div>`;
        html += cartHtml;
    }

    html += `</div>`;

    html += `<div style="margin-top:15px; padding-top:10px; border-top:2px dashed #ccc;">`;

    if (isDutchMode) {
        html += `<div class="bill-list-item"><span>My Orders</span><span>₩ ${myTotal.toLocaleString()}</span></div>`;
        html += `<div class="bill-list-item" style="color:#3b82f6;"><span>Shared Orders (Total)</span><span>₩ ${sharedTotal.toLocaleString()}</span></div>`;

        let defaultN = 2;
        let splitVal = sharedTotal > 0 ? Math.floor(sharedTotal / defaultN) : 0;
        let finalPay = myTotal + splitVal;

        if (sharedTotal > 0) {
            html += `
            <div style="background:#eff6ff; padding:10px; border-radius:8px; margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:12px; color:#3b82f6; font-weight:bold;">Shared 1/N Calculation</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:12px; color:#666;">People:</span>
                        <input type="number" id="split-n" value="${defaultN}" min="2" style="width:40px; padding:2px; text-align:center; border:1px solid #cbd5e1; border-radius:4px;" oninput="calcSharedSplit(${sharedTotal}, ${myTotal})">
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:12px; color:#64748b;">Per Person</span>
                    <span style="font-weight:bold; color:#3b82f6;">₩ <span id="split-val">${splitVal.toLocaleString()}</span></span>
                </div>
            </div>`;
        }

        html += `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:12px; margin-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:13px; color:#166534;">
                <span>My Orders</span><span>₩ ${myTotal.toLocaleString()}</span>
            </div>
            ${sharedTotal > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px; color:#166534;">
                <span>+ Shared (1/<span id="summary-n">${defaultN}</span>)</span><span id="summary-shared-part">₩ ${splitVal.toLocaleString()}</span>
            </div>` : ''}
            <div style="border-top:1px dashed #86efac; margin-bottom:10px;"></div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold; color:#15803d;">YOU PAY</span>
                <span style="font-size:20px; font-weight:900; color:#15803d;">₩ <span id="final-personal-pay">${finalPay.toLocaleString()}</span></span>
            </div>
        </div>`;
    }

    html += `<div class="bill-total" style="margin-top:5px; border-top:none;"><span>Grand Total</span><span style="color:#ef4444;">₩ ${totalPaid.toLocaleString()}</span></div>`;

    const totalSaved = totalOriginal - totalPaid;
    if (totalSaved > 0) {
        html += `<div style="text-align:right; color:#10b981; font-size:13px; font-weight:bold; margin-top:5px;">You Saved: ₩ ${totalSaved.toLocaleString()}</div>`;
    }
    html += `</div>`;

    html += `<div style="display:flex; gap:10px; margin-top:20px;">
        <button onclick="closeModal('modal-bill')" style="flex:1; padding:12px; background:#eee; border:none; border-radius:8px; cursor:pointer;">Close</button>
        <button onclick="finishEating()" style="flex:1; padding:12px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Check Out</button>
    </div>`;

    document.getElementById('bill-body').innerHTML = html;
    document.getElementById('modal-bill').style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function calcSharedSplit(sharedTotal, myTotal) {
    const n = parseInt(document.getElementById('split-n').value) || 1;
    const splitVal = Math.floor(sharedTotal / Math.max(1, n));

    document.getElementById('split-val').innerText = splitVal.toLocaleString();

    if (document.getElementById('summary-n')) document.getElementById('summary-n').innerText = n;
    if (document.getElementById('summary-shared-part')) document.getElementById('summary-shared-part').innerText = '₩ ' + splitVal.toLocaleString();
    if (document.getElementById('final-personal-pay')) document.getElementById('final-personal-pay').innerText = (myTotal + splitVal).toLocaleString();
}

async function submitOrder() {
    const batchId = Date.now();
    const orderItems = [];
    let totalAmount = 0;

    for (let id in cart) {
        if (cart[id] > 0) {
            const isShared = String(id).startsWith('s-');
            const realId = isShared ? id.substring(2) : id;
            const m = menuData.find(x => x.id == realId);

            const itemTotal = m.price * cart[id];
            totalAmount += itemTotal;

            const orderItem = {
                id: m.id,
                name: m.name,
                price: m.price,
                qty: cart[id],
                batchId: batchId,
                isShared: isShared
            };
            confirmedOrders.push(orderItem);
            orderItems.push(orderItem);
        }
    }
    cart = {};
    renderOrderMenu();
    closeModal('modal-bill');
    navigateTo('order-waiting');

    try {
        const docRef = await window.addDoc(window.collection(window.db, "orders"), {
            table: currentTable,
            items: orderItems,
            totalPrice: totalAmount,
            status: 'pending',
            createdAt: Date.now(),
            userId: window.auth.currentUser ? window.auth.currentUser.uid : 'guest'
        });
        console.log("🚀 주문 전송 완료 (Pending)");
        monitorOrderStatus(docRef.id);
    } catch (e) {
        console.error("주문 전송 실패:", e);
        alert("주문 전송 중 오류가 발생했습니다.");
    }
}

async function finishEating() {
    let hasCartItems = false;
    for (let id in cart) {
        if (cart[id] > 0) { hasCartItems = true; break; }
    }

    if (hasCartItems) {
        if (confirmedOrders.length === 0) {
            return alert("아직 확정된 주문이 없습니다.\n장바구니의 메뉴를 주문하려면 먼저 'Submit' 버튼을 눌러주세요.");
        }
        if (!confirm("장바구니에 주문하지 않은 메뉴가 남아있습니다.\n장바구니 항목은 제외하고, 확정된 주문만 결제하시겠습니까?")) {
            return;
        }
    } else {
        if (!confirm("정산(Check Out)하고 식사를 종료하시겠습니까?")) return;
    }

    let totalOriginal = 0, totalPaid = 0;
    const isPaid = userMembershipType === 'paid';
    const getPrice = (p) => isPaid ? Math.floor(p * 0.95) : p;

    const allItems = [...confirmedOrders];
    if (allItems.length === 0) return alert("주문 내역이 없습니다.");

    let summaryText = [];
    allItems.forEach(item => {
        totalOriginal += item.price * item.qty;
        totalPaid += getPrice(item.price) * item.qty;
        summaryText.push(`${item.isShared ? '(Shared) ' : ''}${item.name[currentLang] || item.name['en']} x${item.qty}`);
    });

    try {
        await window.addDoc(window.collection(window.db, "history"), {
            type: "dining",
            date: new Date().toLocaleString(),
            storeName: `Imake Pocha (Table ${currentTable})`,
            items: summaryText.join(", "),
            originalAmount: totalOriginal,
            paidAmount: totalPaid,
            savedAmount: totalOriginal - totalPaid,
            isPaidMember: isPaid,
            created: Date.now(),
            userId: window.auth.currentUser ? window.auth.currentUser.uid : 'guest'
        });
        alert(`🎉 정산 완료! (Check Out)\n\n총 ₩${(totalOriginal - totalPaid).toLocaleString()}원을 절약했습니다!`);
        cart = {}; confirmedOrders = []; currentTable = ""; closeModal('modal-bill'); navigateTo('history');
    } catch (e) { console.error(e); alert("오류 발생"); }
}

function minimizeOrder() { navigateTo('home'); }
function restoreOrderScreen() { navigateTo('order-menu'); }

let orderStatusUnsub = null;

function monitorOrderStatus(orderId) {
    if (orderStatusUnsub) orderStatusUnsub();

    orderStatusUnsub = window.onSnapshot(window.doc(window.db, "orders", orderId), (doc) => {
        if (!doc.exists()) return;
        const data = doc.data();

        if (data.status === 'cooking') {
            const container = document.getElementById('page-order-waiting');
            if (!container) return;

            const title = container.querySelector('h2');
            const desc = container.querySelector('p');
            const icon = container.querySelector('.pulse-icon');
            const btnHome = document.getElementById('btn-go-home');

            if (title) title.innerText = "주문 확인! (조리 중)";
            if (desc) desc.innerHTML = "주방에서 주문을 확인했습니다.<br>맛있게 조리 중입니다.";
            if (icon) {
                icon.innerHTML = '<i data-lucide="chef-hat" style="width:32px; height:32px; color:#ef4444;"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
            if (btnHome) btnHome.style.display = 'block';
        }
    });
}

// [신규] 전역 함수 등록
window.startQRScan = startQRScan;
window.inputNum = inputNum;
window.checkTableNum = checkTableNum;
window.openBillModal = openBillModal;
window.minimizeOrder = minimizeOrder;
window.restoreOrderScreen = restoreOrderScreen;
window.openOrderSummary = openOrderSummary;
window.updateQty = updateQty;
window.submitOrder = submitOrder;
window.finishEating = finishEating;
