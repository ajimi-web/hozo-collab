/**
 * 法造リアルタイム同時編集クライアント (Firebase版)
 * Firebase Realtime Databaseでリアルタイム同期
 */

class HozoCollabApp {
    constructor() {
        this.state = {
            sessionId: null,
            userId: null,
            userName: null,
            userColor: null,
            ontology: null,
            selectedConcept: null,
            tool: 'select',
            zoom: 1,
            pan: { x: 0, y: 0 },
            isDragging: false,
            dragStart: null,
            users: new Map()
        };
        this.db = null;
        this.sessionRef = null;
        this.elements = {};
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.checkFirebaseConfig();
    }

    cacheElements() {
        this.elements = {
            filename: document.getElementById('filename'),
            usersIndicator: document.getElementById('users-indicator'),
            btnDownload: document.getElementById('btn-download'),
            btnShare: document.getElementById('btn-share'),
            welcomeScreen: document.getElementById('welcome-screen'),
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            sessionIdInput: document.getElementById('session-id-input'),
            btnJoinSession: document.getElementById('btn-join-session'),
            canvasContainer: document.getElementById('canvas-container'),
            canvas: document.getElementById('ontology-canvas'),
            canvasContent: document.getElementById('canvas-content'),
            conceptsGroup: document.getElementById('concepts'),
            isaLinksGroup: document.getElementById('isa-links'),
            cursorsGroup: document.getElementById('cursors'),
            zoomControls: document.getElementById('zoom-controls'),
            zoomLevel: document.getElementById('zoom-level'),
            conceptList: document.getElementById('concept-list'),
            searchConcepts: document.getElementById('search-concepts'),
            toolSelect: document.getElementById('tool-select'),
            toolAdd: document.getElementById('tool-add'),
            toolConnect: document.getElementById('tool-connect'),
            toolDelete: document.getElementById('tool-delete'),
            detailPanel: document.getElementById('detail-panel'),
            detailContent: document.getElementById('detail-content'),
            closeDetail: document.getElementById('close-detail'),
            usernameModal: document.getElementById('username-modal'),
            usernameInput: document.getElementById('username-input'),
            btnSetUsername: document.getElementById('btn-set-username'),
            shareModal: document.getElementById('share-modal'),
            shareLink: document.getElementById('share-link'),
            btnCopyLink: document.getElementById('btn-copy-link'),
            closeShareModal: document.getElementById('close-share-modal'),
            firebaseModal: document.getElementById('firebase-modal'),
            btnSaveFirebase: document.getElementById('btn-save-firebase'),
            statusConnection: document.getElementById('status-connection'),
            statusInfo: document.getElementById('status-info'),
            statusConcepts: document.getElementById('status-concepts'),
            statusRelations: document.getElementById('status-relations')
        };
    }

    bindEvents() {
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        this.elements.btnJoinSession.addEventListener('click', () => this.joinSession());
        this.elements.sessionIdInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.joinSession(); });
        this.elements.btnSetUsername.addEventListener('click', () => this.setUsername());
        this.elements.usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.setUsername(); });
        this.elements.btnDownload.addEventListener('click', () => this.downloadXml());
        this.elements.btnShare.addEventListener('click', () => this.showShareModal());
        this.elements.closeShareModal.addEventListener('click', () => this.hideShareModal());
        this.elements.btnCopyLink.addEventListener('click', () => this.copyShareLink());
        this.elements.btnSaveFirebase.addEventListener('click', () => this.saveFirebaseConfig());
        this.elements.toolSelect.addEventListener('click', () => this.setTool('select'));
        this.elements.toolAdd.addEventListener('click', () => this.setTool('add'));
        this.elements.toolConnect.addEventListener('click', () => this.setTool('connect'));
        this.elements.toolDelete.addEventListener('click', () => this.setTool('delete'));
        this.elements.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.elements.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.elements.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.elements.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e));
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoom-fit').addEventListener('click', () => this.zoomFit());
        this.elements.closeDetail.addEventListener('click', () => this.closeDetailPanel());
        this.elements.searchConcepts.addEventListener('input', (e) => this.filterConcepts(e.target.value));
    }

    // --- Firebase設定 ---
    checkFirebaseConfig() {
        const config = localStorage.getItem('firebaseConfig');
        if (config) {
            this.initFirebase(JSON.parse(config));
        } else {
            this.elements.firebaseModal.style.display = 'flex';
        }
    }

    saveFirebaseConfig() {
        const config = {
            apiKey: document.getElementById('firebase-apiKey').value.trim(),
            databaseURL: document.getElementById('firebase-databaseURL').value.trim(),
            projectId: document.getElementById('firebase-projectId').value.trim()
        };

        if (!config.apiKey || !config.databaseURL || !config.projectId) {
            alert('全ての項目を入力してください');
            return;
        }

        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        this.initFirebase(config);
    }

    initFirebase(config) {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            this.db = firebase.database();
            this.elements.firebaseModal.style.display = 'none';
            this.updateConnectionStatus(true);
            this.checkUrlSession();
        } catch (error) {
            console.error('Firebase init error:', error);
            alert('Firebase初期化エラー: ' + error.message);
            this.elements.firebaseModal.style.display = 'flex';
        }
    }

    // --- XMLパーサー ---
    parseXml(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');
        const oeFile = doc.querySelector('OE_FILE');

        const ontology = {
            filename: oeFile?.getAttribute('filename') || 'untitled.xml',
            ontId: oeFile?.getAttribute('ont_id') || Date.now() + 'ont',
            concepts: [],
            isaLinks: [],
            relations: [],
            canvasSize: { w: 2000, h: 3000 }
        };

        const wConcepts = doc.querySelector('W_CONCEPTS');
        if (wConcepts) {
            const canvasSize = wConcepts.querySelector('CANVAS_SIZE');
            if (canvasSize) {
                ontology.canvasSize = {
                    w: parseInt(canvasSize.getAttribute('w')) || 2000,
                    h: parseInt(canvasSize.getAttribute('h')) || 3000
                };
            }
            wConcepts.querySelectorAll(':scope > CONCEPT').forEach(concept => {
                ontology.concepts.push(this.parseConcept(concept));
            });
            wConcepts.querySelectorAll('ISA').forEach(isa => {
                ontology.isaLinks.push({
                    id: isa.getAttribute('id'),
                    parent: isa.getAttribute('parent'),
                    child: isa.getAttribute('child')
                });
            });
        }

        const rConcepts = doc.querySelector('R_CONCEPTS');
        if (rConcepts) {
            rConcepts.querySelectorAll(':scope > CONCEPT').forEach(concept => {
                const parsed = this.parseConcept(concept);
                parsed.isRelation = true;
                ontology.relations.push(parsed);
            });
        }

        return ontology;
    }

    parseConcept(element) {
        const pos = element.querySelector('POS');
        const result = {
            id: element.getAttribute('id') || '',
            label: element.querySelector('LABEL')?.textContent || '',
            position: {
                x: parseInt(pos?.getAttribute('x')) || 0,
                y: parseInt(pos?.getAttribute('y')) || 0
            },
            subTree: element.querySelector('SUB_TREE')?.textContent || 'open',
            slots: []
        };
        element.querySelectorAll(':scope > SLOTS > SLOT').forEach(slot => {
            result.slots.push(this.parseSlot(slot));
        });
        return result;
    }

    parseSlot(element) {
        return {
            id: element.getAttribute('id') || '',
            type: element.getAttribute('type') || 'NW',
            label: element.getAttribute('label') || 'slot',
            kind: element.getAttribute('kind') || 'p/o',
            num: element.getAttribute('num') || '1',
            role: element.getAttribute('role') || '',
            classConstraint: element.getAttribute('class_constraint') || '',
            rhName: element.getAttribute('rh_name') || '',
            value: element.getAttribute('value') || ''
        };
    }

    // --- ファイル処理 ---
    handleDragOver(e) { e.preventDefault(); this.elements.uploadArea.classList.add('dragover'); }
    handleDragLeave(e) { e.preventDefault(); this.elements.uploadArea.classList.remove('dragover'); }
    handleDrop(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) this.uploadFile(e.dataTransfer.files[0]);
    }
    handleFileSelect(e) { if (e.target.files.length > 0) this.uploadFile(e.target.files[0]); }

    async uploadFile(file) {
        if (!file.name.endsWith('.ont')) {
            alert('ONTファイルを選択してください');
            return;
        }
        if (!this.db) { alert('Firebaseが初期化されていません'); return; }

        try {
            const xmlContent = await this.readFileAsText(file);
            const ontology = this.parseXml(xmlContent);
            ontology.filename = file.name;

            // セッションIDを生成
            const sessionId = this.generateSessionId();
            this.state.sessionId = sessionId;

            // Firebaseにセッションを作成
            await this.db.ref(`sessions/${sessionId}`).set({
                ontology: ontology,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });

            this.showUsernameModal();
        } catch (error) {
            console.error('Upload error:', error);
            alert(`ファイルのアップロードに失敗しました: ${error.message}`);
        }
    }

    generateSessionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    // --- セッション管理 ---
    checkUrlSession() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session');
        if (sessionId) { this.state.sessionId = sessionId; this.showUsernameModal(); }
    }

    joinSession() {
        const sessionId = this.elements.sessionIdInput.value.trim();
        if (!sessionId) { alert('セッションIDを入力してください'); return; }
        this.state.sessionId = sessionId;
        this.showUsernameModal();
    }

    showUsernameModal() {
        this.elements.usernameModal.style.display = 'flex';
        this.elements.usernameInput.focus();
    }

    async setUsername() {
        const userName = this.elements.usernameInput.value.trim() || '匿名ユーザー';
        this.state.userName = userName;
        this.state.userId = this.generateSessionId();
        this.state.userColor = this.generateColor();
        this.elements.usernameModal.style.display = 'none';
        await this.connectToSession();
    }

    generateColor() {
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // --- Firebase接続 ---
    async connectToSession() {
        const sessionId = this.state.sessionId;
        this.sessionRef = this.db.ref(`sessions/${sessionId}`);

        // セッションが存在するか確認
        const snapshot = await this.sessionRef.once('value');
        if (!snapshot.exists()) {
            alert('セッションが見つかりません');
            return;
        }

        const data = snapshot.val();
        this.state.ontology = data.ontology;

        // 自分をユーザーリストに追加
        const userRef = this.sessionRef.child(`users/${this.state.userId}`);
        await userRef.set({
            userName: this.state.userName,
            color: this.state.userColor,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // 切断時にユーザーを削除
        userRef.onDisconnect().remove();

        // オントロジーの変更をリッスン
        this.sessionRef.child('ontology').on('value', (snap) => {
            if (snap.exists()) {
                this.state.ontology = snap.val();
                this.renderOntology();
            }
        });

        // ユーザーリストをリッスン
        this.sessionRef.child('users').on('value', (snap) => {
            this.state.users.clear();
            if (snap.exists()) {
                snap.forEach((child) => {
                    this.state.users.set(child.key, { userId: child.key, ...child.val() });
                });
            }
            this.updateUsersList();
        });

        // カーソル位置をリッスン
        this.sessionRef.child('cursors').on('value', (snap) => {
            // 全カーソルをクリア
            this.elements.cursorsGroup.innerHTML = '';
            if (snap.exists()) {
                snap.forEach((child) => {
                    if (child.key !== this.state.userId) {
                        const data = child.val();
                        this.updateCursor(child.key, data.userName, data.color, data.cursor);
                    }
                });
            }
        });

        this.showEditor();
        this.renderOntology();
    }

    // --- 操作 ---
    async sendOperation(operation) {
        if (!this.sessionRef || !this.state.ontology) return;

        // ローカルに適用
        this.applyOperation(operation);

        // Firebaseに保存
        await this.sessionRef.child('ontology').set(this.state.ontology);
        this.renderOntology();
    }

    applyOperation(operation) {
        const o = this.state.ontology;
        if (!o) return;
        switch (operation.type) {
            case 'update-concept':
                const c = o.concepts.find(x => x.id === operation.conceptId);
                if (c) Object.assign(c, operation.changes);
                break;
            case 'add-concept':
                o.concepts = o.concepts || [];
                o.concepts.push(operation.concept);
                break;
            case 'delete-concept':
                o.concepts = (o.concepts || []).filter(x => x.id !== operation.conceptId);
                o.isaLinks = (o.isaLinks || []).filter(x => x.parent !== operation.conceptId && x.child !== operation.conceptId);
                break;
            case 'move-concept':
                const mc = o.concepts?.find(x => x.id === operation.conceptId);
                if (mc) mc.position = operation.position;
                break;
        }
    }

    // --- カーソル送信 ---
    sendCursor(cursor) {
        if (!this.sessionRef) return;
        this.sessionRef.child(`cursors/${this.state.userId}`).set({
            userName: this.state.userName,
            color: this.state.userColor,
            cursor: cursor
        });
    }

    // --- UI ---
    showEditor() {
        this.elements.welcomeScreen.style.display = 'none';
        this.elements.canvas.style.display = 'block';
        this.elements.zoomControls.style.display = 'flex';
        this.elements.btnDownload.disabled = false;
        this.elements.filename.textContent = this.state.ontology?.filename || 'untitled.xml';
        const url = new URL(window.location);
        url.searchParams.set('session', this.state.sessionId);
        window.history.pushState({}, '', url);
    }

    updateConnectionStatus(connected) {
        this.elements.statusConnection.textContent = connected ? '🟢 Firebase接続中' : '🔴 切断';
        this.elements.statusConnection.classList.toggle('connected', connected);
        this.elements.statusConnection.classList.toggle('disconnected', !connected);
    }

    updateUsersList() {
        const ind = this.elements.usersIndicator;
        ind.innerHTML = '';
        this.state.users.forEach(user => {
            const av = document.createElement('div');
            av.className = 'user-avatar';
            av.style.backgroundColor = user.color;
            av.textContent = user.userName?.charAt(0).toUpperCase() || '?';
            av.title = user.userName || 'Unknown';
            ind.appendChild(av);
        });
    }

    showNotification(msg) {
        this.elements.statusInfo.textContent = msg;
        setTimeout(() => { this.elements.statusInfo.textContent = '法造 同時編集システム v1.0 (Firebase)'; }, 3000);
    }

    // --- 描画 ---
    renderOntology() {
        if (!this.state.ontology) return;
        const concepts = this.state.ontology.concepts || [];
        const isaLinks = this.state.ontology.isaLinks || [];
        this.renderConceptList(concepts);
        this.renderIsaLinks(isaLinks, concepts);
        this.renderConcepts(concepts);
        this.elements.statusConcepts.textContent = `概念: ${concepts.length}`;
        this.elements.statusRelations.textContent = `関係: ${isaLinks.length}`;
    }

    renderConceptList(concepts) {
        const list = this.elements.conceptList;
        list.innerHTML = '';
        concepts.forEach(c => {
            const item = document.createElement('li');
            item.className = 'concept-list-item' + (this.state.selectedConcept === c.id ? ' selected' : '');
            item.innerHTML = `<span class="concept-icon">📦</span><span>${c.label}</span>`;
            item.addEventListener('click', () => this.selectConcept(c.id));
            list.appendChild(item);
        });
    }

    renderConcepts(concepts) {
        const g = this.elements.conceptsGroup;
        g.innerHTML = '';
        concepts.forEach(c => g.appendChild(this.createConceptNode(c)));
    }

    createConceptNode(c) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'concept-node' + (this.state.selectedConcept === c.id ? ' selected' : ''));
        g.setAttribute('data-id', c.id);
        g.setAttribute('transform', `translate(${c.position.x}, ${c.position.y})`);
        const w = Math.max(80, c.label.length * 12 + 20), h = 36;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'concept-body');
        rect.setAttribute('x', -w / 2); rect.setAttribute('y', -h / 2);
        rect.setAttribute('width', w); rect.setAttribute('height', h);
        g.appendChild(rect);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'concept-label');
        text.textContent = c.label;
        g.appendChild(text);
        g.addEventListener('mousedown', (e) => this.handleConceptMouseDown(e, c));
        g.addEventListener('dblclick', () => this.editConceptLabel(c));
        return g;
    }

    renderIsaLinks(isaLinks, concepts) {
        const g = this.elements.isaLinksGroup;
        g.innerHTML = '';
        isaLinks.forEach(isa => {
            const parent = concepts.find(c => c.label === isa.parent);
            const child = concepts.find(c => c.label === isa.child);
            if (parent && child) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'isa-link');
                line.setAttribute('x1', parent.position.x); line.setAttribute('y1', parent.position.y);
                line.setAttribute('x2', child.position.x); line.setAttribute('y2', child.position.y);
                line.setAttribute('marker-end', 'url(#arrow)');
                g.appendChild(line);
            }
        });
    }

    // --- 概念操作 ---
    selectConcept(id) { this.state.selectedConcept = id; this.renderOntology(); this.showConceptDetail(id); }

    handleConceptMouseDown(e, c) {
        e.stopPropagation();
        if (this.state.tool === 'select') {
            this.selectConcept(c.id);
            this.state.isDragging = true;
            this.state.dragStart = { x: e.clientX, y: e.clientY, conceptX: c.position.x, conceptY: c.position.y, conceptId: c.id };
        } else if (this.state.tool === 'delete') {
            this.deleteConcept(c.id);
        }
    }

    editConceptLabel(c) {
        const newLabel = prompt('概念名を入力:', c.label);
        if (newLabel && newLabel !== c.label) this.sendOperation({ type: 'update-concept', conceptId: c.id, changes: { label: newLabel } });
    }

    addConcept(x, y) {
        const label = prompt('新しい概念名を入力:');
        if (!label) return;
        const id = `${Date.now()}_n${Math.random().toString(36).substr(2, 9)}`;
        this.sendOperation({ type: 'add-concept', concept: { id, label, position: { x, y }, slots: [] } });
    }

    deleteConcept(id) {
        if (confirm('この概念を削除しますか？')) {
            this.sendOperation({ type: 'delete-concept', conceptId: id });
            this.state.selectedConcept = null;
            this.closeDetailPanel();
        }
    }

    showConceptDetail(id) {
        const concepts = this.state.ontology?.concepts || [];
        const c = concepts.find(x => x.id === id);
        if (!c) return;
        this.elements.detailPanel.classList.add('open');
        let slots = '';
        if (c.slots?.length) {
            slots = `<div class="slots-list"><h4>スロット</h4>${c.slots.map(s => `<div class="slot-item"><div class="slot-header"><span class="slot-role">${s.role}</span><span class="slot-constraint">${s.classConstraint}</span></div></div>`).join('')}</div>`;
        }
        this.elements.detailContent.innerHTML = `
      <div class="detail-field"><label>概念名</label><input type="text" id="edit-label" value="${c.label}"></div>
      <div class="detail-field"><label>ID</label><input type="text" value="${c.id}" readonly></div>
      <div class="detail-field"><label>位置</label><input type="text" value="X: ${c.position.x}, Y: ${c.position.y}" readonly></div>
      ${slots}
      <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="app.updateConceptFromDetail('${c.id}')">更新</button>`;
    }

    updateConceptFromDetail(id) {
        const newLabel = document.getElementById('edit-label').value;
        const concepts = this.state.ontology?.concepts || [];
        const c = concepts.find(x => x.id === id);
        if (c && newLabel !== c.label) this.sendOperation({ type: 'update-concept', conceptId: id, changes: { label: newLabel } });
    }

    closeDetailPanel() { this.elements.detailPanel.classList.remove('open'); }

    filterConcepts(q) {
        const lq = q.toLowerCase();
        this.elements.conceptList.querySelectorAll('.concept-list-item').forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(lq) ? '' : 'none';
        });
    }

    // --- キャンバス ---
    handleCanvasMouseDown(e) {
        if (e.target === this.elements.canvas || (e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'url(#grid)')) {
            if (this.state.tool === 'add') {
                const pt = this.getCanvasPoint(e);
                this.addConcept(pt.x, pt.y);
            } else {
                this.state.isDragging = true;
                this.state.dragStart = { x: e.clientX, y: e.clientY, panX: this.state.pan.x, panY: this.state.pan.y };
            }
        }
    }

    handleCanvasMouseMove(e) {
        const pt = this.getCanvasPoint(e);
        this.sendCursor(pt);

        if (!this.state.isDragging) return;
        if (this.state.dragStart.conceptId) {
            const dx = (e.clientX - this.state.dragStart.x) / this.state.zoom;
            const dy = (e.clientY - this.state.dragStart.y) / this.state.zoom;
            const concepts = this.state.ontology?.concepts || [];
            const c = concepts.find(x => x.id === this.state.dragStart.conceptId);
            if (c) {
                c.position = { x: Math.round(this.state.dragStart.conceptX + dx), y: Math.round(this.state.dragStart.conceptY + dy) };
                this.renderOntology();
            }
        } else {
            this.state.pan.x = this.state.dragStart.panX + (e.clientX - this.state.dragStart.x);
            this.state.pan.y = this.state.dragStart.panY + (e.clientY - this.state.dragStart.y);
            this.updateCanvasTransform();
        }
    }

    handleCanvasMouseUp(e) {
        if (this.state.isDragging && this.state.dragStart?.conceptId) {
            const concepts = this.state.ontology?.concepts || [];
            const c = concepts.find(x => x.id === this.state.dragStart.conceptId);
            if (c) this.sendOperation({ type: 'move-concept', conceptId: c.id, position: c.position });
        }
        this.state.isDragging = false;
        this.state.dragStart = null;
    }

    handleCanvasWheel(e) {
        e.preventDefault();
        this.state.zoom = Math.max(0.1, Math.min(3, this.state.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
        this.updateCanvasTransform();
        this.elements.zoomLevel.textContent = `${Math.round(this.state.zoom * 100)}%`;
    }

    getCanvasPoint(e) {
        const rect = this.elements.canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left - this.state.pan.x) / this.state.zoom, y: (e.clientY - rect.top - this.state.pan.y) / this.state.zoom };
    }

    updateCanvasTransform() {
        this.elements.canvasContent.setAttribute('transform', `translate(${this.state.pan.x}, ${this.state.pan.y}) scale(${this.state.zoom})`);
    }

    zoomIn() { this.state.zoom = Math.min(3, this.state.zoom + 0.2); this.updateCanvasTransform(); this.elements.zoomLevel.textContent = `${Math.round(this.state.zoom * 100)}%`; }
    zoomOut() { this.state.zoom = Math.max(0.1, this.state.zoom - 0.2); this.updateCanvasTransform(); this.elements.zoomLevel.textContent = `${Math.round(this.state.zoom * 100)}%`; }
    zoomFit() { this.state.zoom = 1; this.state.pan = { x: 50, y: 50 }; this.updateCanvasTransform(); this.elements.zoomLevel.textContent = '100%'; }

    // --- ツール ---
    setTool(t) {
        this.state.tool = t;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const btn = this.elements[`tool${t.charAt(0).toUpperCase() + t.slice(1)}`];
        if (btn) btn.classList.add('active');
    }

    // --- カーソル表示 ---
    updateCursor(userId, userName, color, cursor) {
        if (!cursor) return;
        let el = document.getElementById(`cursor-${userId}`);
        if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            el.id = `cursor-${userId}`;
            el.setAttribute('class', 'user-cursor');
            el.innerHTML = `<polygon class="cursor-pointer" points="0,0 0,18 5,14 9,22 12,21 8,13 14,13" style="color:${color}"/>
        <rect class="cursor-label-bg" x="14" y="14" width="${(userName?.length || 5) * 8 + 8}" height="18" fill="${color}"/>
        <text class="cursor-label" x="18" y="26">${userName || 'User'}</text>`;
            this.elements.cursorsGroup.appendChild(el);
        }
        el.setAttribute('transform', `translate(${cursor.x}, ${cursor.y})`);
    }

    // --- 共有 ---
    showShareModal() { this.elements.shareLink.value = window.location.href; this.elements.shareModal.style.display = 'flex'; }
    hideShareModal() { this.elements.shareModal.style.display = 'none'; }
    copyShareLink() {
        this.elements.shareLink.select();
        document.execCommand('copy');
        this.elements.btnCopyLink.textContent = 'コピーしました！';
        setTimeout(() => { this.elements.btnCopyLink.textContent = 'コピー'; }, 2000);
    }

    // --- ダウンロード ---
    downloadXml() {
        if (!this.state.ontology) return;
        const xml = this.generateXml();
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.state.ontology.filename || 'ontology.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    generateXml() {
        const o = this.state.ontology;
        if (!o) return '<?xml version="1.0" encoding="UTF-8"?><OE_FILE/>';
        const concepts = o.concepts || [];
        const isaLinks = o.isaLinks || [];
        const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<OE_FILE filename="${esc(o.filename)}" ont_id="${esc(o.ontId)}">
<FILENAME_ONT>${esc(o.filename)}</FILENAME_ONT>
<W_CONCEPTS>
<CANVAS_SIZE w="${o.canvasSize?.w || 2000}" h="${o.canvasSize?.h || 3000}" x="0" y="0"/>
`;
        concepts.forEach(c => {
            xml += `<CONCEPT id="${esc(c.id)}">
<LABEL>${esc(c.label)}</LABEL>
<SUB_LABELS></SUB_LABELS>
<POS x="${c.position?.x || 0}" y="${c.position?.y || 0}"/>
${c.subTree ? `<SUB_TREE>${c.subTree}</SUB_TREE>` : ''}
<RELATIONS></RELATIONS>
</CONCEPT>
`;
        });
        isaLinks.forEach(isa => {
            xml += `<ISA id="${esc(isa.id)}" parent="${esc(isa.parent)}" child="${esc(isa.child)}"/>
`;
        });
        xml += `</W_CONCEPTS>
<R_CONCEPTS><CANVAS_SIZE w="2000" h="3000"/></R_CONCEPTS>
<PRINTER>
<PAGE_SETTINGS header="true" footer="true" cropmarks="true" scale="100"/>
<PAGE_FORMAT w="595.33" h="841.92" iw="451.33" ih="697.92" ix="72.0" iy="72.0"/>
<PRINTER_SETTINGS orientation="1" printername="Default"/>
</PRINTER>
</OE_FILE>`;
        return xml;
    }
}

const app = new HozoCollabApp();
