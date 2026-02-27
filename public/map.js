/* ==========================================================
   [지도 / 추천 리스트 / 카테고리 필터]
   ========================================================== */

// 맛집 리스트 그리기
function renderRecList(category, subCat = null) {
    const list = document.getElementById('rec-list-container');
    if (!list) return;
    let filtered = (category === 'all' || !category)
        ? recData
        : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());

    if (subCat) {
        filtered = filtered.filter(item =>
            (item.tags || []).some(t => t.toLowerCase().includes(subCat.toLowerCase())) ||
            (item.subCategory && item.subCategory.toLowerCase().includes(subCat.toLowerCase()))
        );
    }

    list.innerHTML = filtered.map(item => `
        <div class="list-item" onclick="openDetailModal('${item.id}')">
            <div class="img-box" style="width: 80px; height: 80px; border-radius: 12px; overflow: hidden; margin-right: 15px; flex-shrink: 0;">
                <img src="${item.img || 'https://via.placeholder.com/80'}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div class="list-content">
                <div class="item-title" style="font-weight: bold; font-size: 16px; margin-bottom: 4px;">
                    ${escapeHTML(item.title)} <span style="color: ${item.status === 'red' ? '#ff4d4f' : item.status === 'yellow' ? '#faad14' : '#52c41a'};">●</span>
                </div>
                <div class="item-desc" style="font-size: 13px; color: #666; margin-bottom: 4px;">${escapeHTML(item.desc || '')}</div>
                <div class="item-tags">
                    ${(item.tags || []).map(t => `<span class="tag" style="background:#f0f0f0; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px;">#${escapeHTML(t)}</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

// 상세 모달 및 즐겨찾기
function openDetailModal(id) {
    const item = recData.find(i => i.id === id);
    if (!item) return;

    const isFav = favList.some(f => f.title === item.title);
    const favIconClass = isFav ? "fill: #ef4444; color: #ef4444;" : "color: #666;";
    const favText = isFav ? "즐겨찾기 해제" : "즐겨찾기 추가";

    const addrHtml = item.addr ? `<div style="margin-bottom:12px; color:#3b82f6; font-weight:bold; font-size:14px; display:flex; align-items:center; gap:4px;"><i data-lucide="map-pin" style="width:16px;"></i> ${escapeHTML(item.addr)}</div>` : '';
    const subCatHtml = item.subCategory ? `<div style="margin-bottom:10px;"><span style="background:#eff6ff; color:#3b82f6; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:bold;">#${escapeHTML(item.subCategory)}</span></div>` : '';

    const html = `
        <div style="position:relative;">
            <img src="${item.img || 'https://via.placeholder.com/400x250'}" style="width:100%; height:220px; object-fit:cover;">
            <div style="position:absolute; bottom:0; left:0; width:100%; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent); padding:20px; color:white;">
                <h2 style="margin:0; font-size:22px;">${escapeHTML(item.title)}</h2>
                <div style="font-size:13px; opacity:0.9; margin-top:4px;">${escapeHTML(item.cat || 'Place')}</div>
            </div>
        </div>
        <div style="padding:20px;">
            ${subCatHtml}
            ${addrHtml}
            <p style="color:#444; line-height:1.6; margin-top:0;">${escapeHTML(item.desc || '상세 설명이 없습니다.')}</p>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button onclick="toggleRecFavorite('${item.id}')" style="flex:1; padding:12px; border:1px solid #ddd; background:white; border-radius:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
                    <i data-lucide="heart" style="width:18px; ${favIconClass}"></i> <span id="fav-btn-text">${favText}</span>
                </button>
                <button onclick="moveToMap('${item.title}', ${item.lat}, ${item.lng}); closeModal('modal-detail');" style="flex:1; padding:12px; background:#3b82f6; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">
                    📍 지도 보기
                </button>
            </div>
        </div>
    `;

    document.getElementById('detail-body').innerHTML = html;
    document.getElementById('modal-detail').style.display = 'flex';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function toggleRecFavorite(recId) {
    const item = recData.find(i => i.id === recId);
    if (!item) return;

    const existingFav = favList.find(f => f.title === item.title);
    if (existingFav) {
        await deleteItem('favorites', existingFav.id);
    } else {
        await window.addDoc(window.collection(window.db, "favorites"), {
            title: item.title, desc: item.desc || '', cat: item.cat || '', created: Date.now()
        });
    }
    openDetailModal(recId);
}

// 지도 초기화 및 마커
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || map !== null) return;
    map = L.map('map').setView([37.5665, 126.9780], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    updateMapMarkers('all');
    findMyLocation();
}

function updateMapMarkers(category, subCat = null) {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    let filtered = (category === 'all' || !category)
        ? recData
        : recData.filter(item => (item.cat || '').toLowerCase() === category.toLowerCase());

    if (subCat) {
        filtered = filtered.filter(item =>
            (item.tags || []).some(t => t.toLowerCase().includes(subCat.toLowerCase())) ||
            (item.subCategory && item.subCategory.toLowerCase().includes(subCat.toLowerCase()))
        );
    }

    filtered.forEach(item => {
        if (item.lat && item.lng) {
            const marker = L.marker([item.lat, item.lng]).addTo(map);
            const addrInfo = item.addr ? `<br><span style="color:#3b82f6; font-size:11px;">${escapeHTML(item.addr)}</span>` : '';
            marker.bindPopup(`<b>${escapeHTML(item.title)}</b>${addrInfo}<br>${escapeHTML(item.desc || '')}`);
            markers.push(marker);
        }
    });

    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

function moveToMap(title, lat, lng) {
    if (!map) return;
    navigateTo('home');
    setTimeout(() => {
        map.invalidateSize();
        map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
        markers.forEach(m => {
            const p = m.getLatLng();
            if (Math.abs(p.lat - lat) < 0.0001) m.openPopup();
        });
    }, 300);
}

// 카테고리/2차 카테고리 모달 (index.html의 modal-category-menu 사용)
function filterCategory(category) {
    if (category === 'all') {
        applyCategoryFilter('all');
    } else {
        openCategoryModal(category);
    }
}

function applyCategoryFilter(category, subCat = null) {
    document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.cat-btn[onclick*="'${category}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
    renderRecList(category, subCat);
    updateMapMarkers(category, subCat);
}

// 2차 카테고리 데이터 (전 카테고리)
const categoryMenuData = {
    'food': {
        'rice': { label: 'Rice (밥)', items: [{ name: 'Bibimbap (비빔밥)', desc: 'Mixed rice with vegetables', tag: 'Bibimbap' }, { name: 'Gukbap (국밥)', desc: 'Hot soup with rice', tag: 'Gukbap' }, { name: 'Fried Rice (볶음밥)', desc: 'Stir-fried rice', tag: 'Fried Rice' }] },
        'noodle': { label: 'Noodles (면)', items: [{ name: 'Naengmyeon (냉면)', desc: 'Cold buckwheat noodles', tag: 'Naengmyeon' }, { name: 'Jajangmyeon (짜장면)', desc: 'Noodles in black bean sauce', tag: 'Jajangmyeon' }, { name: 'Kalguksu (칼국수)', desc: 'Hand-cut noodle soup', tag: 'Kalguksu' }, { name: 'Ramyeon (라면)', desc: 'Spicy instant noodles', tag: 'Ramyeon' }] },
        'soup': { label: 'Soup (국/탕)', items: [{ name: 'Kimchi Stew (김치찌개)', desc: 'Spicy stew with kimchi', tag: 'Kimchi Stew' }, { name: 'Samgyetang (삼계탕)', desc: 'Ginseng chicken soup', tag: 'Samgyetang' }, { name: 'Sundae-guk (순대국)', desc: 'Blood sausage soup', tag: 'Sundae-guk' }, { name: 'Gamjatang (감자탕)', desc: 'Pork bone soup', tag: 'Gamjatang' }] },
        'bbq': { label: 'BBQ (구이)', items: [{ name: 'Samgyeopsal (삼겹살)', desc: 'Grilled pork belly', tag: 'Samgyeopsal' }, { name: 'Galbi (갈비)', desc: 'Grilled ribs', tag: 'Galbi' }, { name: 'Bulgogi (불고기)', desc: 'Marinated beef', tag: 'Bulgogi' }] },
        'street': { label: 'Street (분식)', items: [{ name: 'Tteokbokki (떡볶이)', desc: 'Spicy rice cakes', tag: 'Tteokbokki' }, { name: 'Sundae (순대)', desc: 'Korean blood sausage', tag: 'Sundae' }, { name: 'Gimbap (김밥)', desc: 'Seaweed rice rolls', tag: 'Gimbap' }] }
    },
    'cafe': {
        'coffee': { label: 'Coffee', items: [{ name: 'Coffee', desc: '아메리카노, 라떼 등', tag: 'coffee' }] },
        'tea': { label: 'Traditional Tea', items: [{ name: 'Traditional Tea', desc: '쌍화차, 오미자차 등', tag: 'traditional tea' }] },
        'dessert': { label: 'Dessert', items: [{ name: 'Dessert', desc: '마카롱, 케이크, 빙수 등', tag: '디저트' }] },
        'bakery': { label: 'Bakery', items: [{ name: 'Bakery', desc: '갓 구운 빵과 샌드위치', tag: '베이커리' }] }
    },
    'activity': {
        'indoor': { label: 'Indoor', items: [{ name: 'Indoor Activity', desc: '실내 스포츠, 공방, 전시 등', tag: 'indoor' }] },
        'outdoor': { label: 'Outdoor', items: [{ name: 'Outdoor Activity', desc: '놀이공원, 수상레저, 등산 등', tag: 'outdoor' }] }
    },
    'stay': {
        'hotel': { label: 'Hotel', items: [{ name: 'Hotel', desc: '편안하고 고급스러운 휴식', tag: 'hotel' }] },
        'hanok': { label: 'Hanok', items: [{ name: 'Hanok Stay', desc: '한국 전통 가옥 체험', tag: '한옥' }] },
        'motel': { label: 'Motel', items: [{ name: 'Motel', desc: '합리적인 가격의 숙박', tag: '모텔' }] },
        'guesthouse': { label: 'Guesthouse', items: [{ name: 'Guesthouse', desc: '여행자들과의 만남', tag: '게스트하우스' }] },
        'pension': { label: 'Pension', items: [{ name: 'Pension', desc: '바베큐와 자연 속 휴식', tag: '펜션' }] }
    },
    'healing': {
        'massage': { label: 'Massage', items: [{ name: 'Massage', desc: '전신, 발 마사지 등', tag: '마사지' }] },
        'templestay': { label: 'Templestay', items: [{ name: 'Templestay', desc: '사찰에서의 힐링 체험', tag: '템플스테이' }] }
    },
    'beauty': {
        'hair': { label: 'Hair', items: [{ name: 'Hair Salon', desc: '컷, 펌, 염색 등', tag: '헤어' }] },
        'makeup': { label: 'Makeup', items: [{ name: 'Makeup', desc: '전문가의 메이크업', tag: '메이크업' }] },
        'fashion': { label: 'Fashion Style', items: [{ name: 'Fashion Styling', desc: '퍼스널 쇼퍼, 스타일링', tag: '패션스타일' }] },
        'personal': { label: 'Personal Color', items: [{ name: 'Personal Color', desc: '나에게 맞는 컬러 진단', tag: '퍼스널컬러' }] }
    },
    'shopping': {
        'taxfree': { label: 'Tax Free', items: [{ name: 'Tax Free Shop', desc: '외국인 면세 쇼핑', tag: 'tax free' }] },
        'mart': { label: 'Mart', items: [{ name: 'Hyper Market', desc: '대형 마트 및 식료품', tag: 'mart' }] },
        'glasses': { label: 'Glasses', items: [{ name: 'Optical Shop', desc: '빠른 맞춤 안경 및 렌즈', tag: '안경' }] },
        'cloth': { label: 'Cloth', items: [{ name: 'Clothing Store', desc: '트렌디한 K-패션', tag: 'cloth' }] },
        'shoes': { label: 'Shoes', items: [{ name: 'Shoe Store', desc: '스니커즈, 구두 등', tag: 'shoes' }] }
    }
};

function openCategoryModal(category) {
    const catData = categoryMenuData[category];
    if (!catData) {
        applyCategoryFilter(category);
        return;
    }
    const modal = document.getElementById('modal-category-menu');
    const titleEl = document.getElementById('category-modal-title');
    const tabsContainer = document.getElementById('category-tabs');
    if (!modal || !titleEl || !tabsContainer) return;

    const categoryIcons = { 'food': 'utensils', 'cafe': 'coffee', 'activity': 'ticket', 'stay': 'bed', 'healing': 'leaf', 'beauty': 'scissors', 'shopping': 'shopping-bag' };
    const iconName = categoryIcons[category] || 'layers';
    titleEl.innerHTML = `<i data-lucide="${iconName}" style="width:20px; vertical-align:middle; margin-right:6px; color:var(--primary);"></i><span style="vertical-align:middle;">${category.charAt(0).toUpperCase() + category.slice(1)}</span>`;

    tabsContainer.innerHTML = Object.keys(catData).map(key => `
        <button onclick="switchCategoryTab('${category}', '${key}')" class="category-tab-btn" id="tab-${key}" style="padding: 15px 10px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: bold; color: #888; cursor: pointer; margin-right: 10px;">
            ${catData[key].label}
        </button>
    `).join('');

    modal.style.display = 'flex';
    const firstKey = Object.keys(catData)[0];
    if (firstKey) switchCategoryTab(category, firstKey);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function switchCategoryTab(category, key) {
    document.querySelectorAll('.category-tab-btn').forEach(btn => { btn.style.borderBottomColor = 'transparent'; btn.style.color = '#888'; });
    const activeBtn = document.getElementById(`tab-${key}`);
    if (activeBtn) { activeBtn.style.borderBottomColor = '#3b82f6'; activeBtn.style.color = '#3b82f6'; }

    const contentContainer = document.getElementById('category-content');
    const data = categoryMenuData[category] && categoryMenuData[category][key];
    const items = (data && data.items) || [];

    contentContainer.innerHTML = items.map(item => `
        <div onclick="selectCategoryItem('${category}', '${item.tag.replace(/'/g, "\\'")}')" style="background: white; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); cursor: pointer;">
            <div style="width: 60px; height: 60px; background: #eee; border-radius: 8px; flex-shrink: 0; display:flex; align-items:center; justify-content:center; color:#ccc;"><i data-lucide="check-circle"></i></div>
            <div>
                <div style="font-weight: bold; font-size: 16px;">${item.name}</div>
                <div style="font-size: 13px; color: #666; margin-top: 4px;">${item.desc}</div>
            </div>
        </div>
    `).join('') + (data ? `
        <button onclick="selectCategoryItem('${category}', '${key}')" style="width: 100%; padding: 15px; background: #e0f2fe; color: #0284c7; border: none; border-radius: 12px; font-weight: bold; margin-top: 10px; cursor: pointer;">
            View All ${data.label}
        </button>
    ` : '');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectCategoryItem(category, tag) {
    closeModal('modal-category-menu');
    applyCategoryFilter(category, tag);
}

// 위치 찾기 및 주소 변환
function findMyLocation() {
    if (!navigator.geolocation) return alert("GPS 지원 불가");
    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        if (map) {
            map.flyTo([latitude, longitude], 15);
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.circleMarker([latitude, longitude], { radius: 8, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
            getAddressFromCoords(latitude, longitude);
        }
    }, () => alert("위치 권한 필요"), { enableHighAccuracy: true });
}

async function getAddressFromCoords(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.display_name) {
            const addrElement = document.getElementById('current-addr');
            if (addrElement) addrElement.innerText = data.display_name;
            console.log("📍 주소 변환 성공:", data.display_name);
        }
    } catch (e) {
        console.error("주소 변환 실패:", e);
    }
}

// 전역 함수 등록 (HTML onclick에서 사용)
window.moveToMap = moveToMap;
window.filterCategory = filterCategory;
window.switchCategoryTab = switchCategoryTab;
window.selectCategoryItem = selectCategoryItem;
