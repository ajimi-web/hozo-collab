/**
 * 法造リアルタイム同時編集クライアント
 * Hozo Collaborative Ontology Editor - Client Application
 */

class HozoCollabApp {
    constructor() {
        // 状態管理
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

        // WebSocket接続
        this.ws = null;

        // DOM要素
        this.elements = {};

        // 初期化
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.checkUrlSession();
    }

    cacheElements() {
        this.elements = {
            // ヘッダー
            filename: document.getElementById('filename'),
            usersIndicator: document.getElementById('users-indicator'),
            btnDownload: document.getElementById('btn-download'),
            btnShare: document.getElementById('btn-share'),

            // メイン
            welcomeScreen: document.getElementById('welcome-screen'),
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            sessionIdInput: document.getElementById('session-id-input'),
            btnJoinSession: document.getElementById('btn-join-session'),

            // キャンバス
            canvasContainer: document.getElementById('canvas-container'),
            canvas: document.getElementById('ontology-canvas'),
            canvasContent: document.getElementById('canvas-content'),
            conceptsGroup: document.getElementById('concepts'),
            isaLinksGroup: document.getElementById('isa-links'),
            cursorsGroup: document.getElementById('cursors'),
            zoomControls: document.getElementById('zoom-controls'),
            zoomLevel: document.getElementById('zoom-level'),

            // サイドバー
            conceptList: document.getElementById('concept-list'),
            searchConcepts: document.getElementById('search-concepts'),

            // ツール
            toolSelect: document.getElementById('tool-select'),
            toolAdd: document.getElementById('tool-add'),
            toolConnect: document.getElementById('tool-connect'),
            toolDelete: document.getElementById('tool-delete'),

            // 詳細パネル
            detailPanel: document.getElementById('detail-panel'),
            detailContent: document.getElementById('detail-content'),
            closeDetail: document.getElementById('close-detail'),

            // モーダル
            usernameModal: document.getElementById('username-modal'),
            usernameInput: document.getElementById('username-input'),
            btnSetUsername: document.getElementById('btn-set-username'),
            shareModal: document.getElementById('share-modal'),
            shareLink: document.getElementById('share-link'),
            btnCopyLink: document.getElementById('btn-copy-link'),
            closeShareModal: document.getElementById('close-share-modal'),

            // ステータスバー
            statusConnection: document.getElementById('status-connection'),
            statusInfo: document.getElementById('status-info'),
            statusConcepts: document.getElementById('status-concepts'),
            statusRelations: document.getElementById('status-relations')
        };
    }

    bindEvents() {
        // ファイルアップロード
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // セッション参加
        this.elements.btnJoinSession.addEventListener('click', () => this.joinSession());
        this.elements.sessionIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinSession();
        });

        // ユーザー名設定
        this.elements.btnSetUsername.addEventListener('click', () => this.setUsername());
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setUsername();
        });

        // ヘッダーボタン
        this.elements.btnDownload.addEventListener('click', () => this.downloadXml());
        this.elements.btnShare.addEventListener('click', () => this.showShareModal());
        this.elements.closeShareModal.addEventListener('click', () => this.hideShareModal());
        this.elements.btnCopyLink.addEventListener('click', () => this.copyShareLink());

        // ツール選択
        this.elements.toolSelect.addEventListener('click', () => this.setTool('select'));
        this.elements.toolAdd.addEventListener('click', () => this.setTool('add'));
        this.elements.toolConnect.addEventListener('click', () => this.setTool('connect'));
        this.elements.toolDelete.addEventListener('click', () => this.setTool('delete'));

        // キャンバス操作
        this.elements.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.elements.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.elements.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.elements.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e));

        // ズームコントロール
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoom-fit').addEventListener('click', () => this.zoomFit());

        // 詳細パネル
        this.elements.closeDetail.addEventListener('click', () => this.closeDetailPanel());

        // 概念検索
        this.elements.searchConcepts.addEventListener('input', (e) => this.filterConcepts(e.target.value));
    }

    // --- ファイル処理 ---

    handleDragOver(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.uploadFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.uploadFile(files[0]);
        }
    }

    async uploadFile(file) {
        if (!file.name.endsWith('.xml')) {
            alert('XMLファイルを選択してください');
            return;
        }

        try {
            const xmlContent = await this.readFileAsText(file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xmlContent, filename: file.name })
            });

            const data = await response.json();

            if (data.success) {
                this.state.sessionId = data.sessionId;
                this.showUsernameModal();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert(`ファイルのアップロードに失敗しました: ${error.message}`);
        }
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
        if (sessionId) {
            this.state.sessionId = sessionId;
            this.showUsernameModal();
        }
    }

    joinSession() {
        const sessionId = this.elements.sessionIdInput.value.trim();
        if (!sessionId) {
            alert('セッションIDを入力してください');
            return;
        }
        this.state.sessionId = sessionId;
        this.showUsernameModal();
    }

    showUsernameModal() {
        this.elements.usernameModal.style.display = 'flex';
        this.elements.usernameInput.focus();
    }

    setUsername() {
        const userName = this.elements.usernameInput.value.trim() || '匿名ユーザー';
        this.state.userName = userName;
        this.elements.usernameModal.style.display = 'none';
        this.connectWebSocket();
    }

    // --- WebSocket通信 ---

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateConnectionStatus(true);

            // セッションに参加
            this.ws.send(JSON.stringify({
                type: 'join',
                sessionId: this.state.sessionId,
                userName: this.state.userName
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus(false);

            // 再接続を試行
            setTimeout(() => {
                if (this.state.sessionId) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'joined':
                this.handleJoined(data);
                break;
            case 'user-joined':
                this.handleUserJoined(data);
                break;
            case 'user-left':
                this.handleUserLeft(data);
                break;
            case 'operation':
                this.handleOperation(data);
                break;
            case 'cursor-update':
                this.handleCursorUpdate(data);
                break;
            case 'error':
                alert(`エラー: ${data.message}`);
                break;
        }
    }

    handleJoined(data) {
        this.state.userId = data.userId;
        this.state.userColor = data.color;
        this.state.ontology = data.ontology;

        // ユーザー一覧を更新
        data.users.forEach(user => {
            this.state.users.set(user.userId, user);
        });

        this.showEditor();
        this.renderOntology();
        this.updateUsersList();
    }

    handleUserJoined(data) {
        this.state.users.set(data.userId, {
            userId: data.userId,
            userName: data.userName,
            color: data.color
        });
        this.updateUsersList();
        this.showNotification(`${data.userName} が参加しました`);
    }

    handleUserLeft(data) {
        this.state.users.delete(data.userId);
        this.updateUsersList();
        this.removeCursor(data.userId);
        this.showNotification(`${data.userName} が退出しました`);
    }

    handleOperation(data) {
        // オントロジーに操作を適用
        this.applyOperation(data.operation);
        this.renderOntology();
    }

    handleCursorUpdate(data) {
        if (data.userId !== this.state.userId) {
            this.updateCursor(data.userId, data.userName, data.color, data.cursor);
        }
    }

    // --- 操作の適用 ---

    applyOperation(operation) {
        const ontology = this.state.ontology;

        switch (operation.type) {
            case 'update-concept':
                const concept = ontology.concepts.find(c => c.id === operation.conceptId);
                if (concept) {
                    Object.assign(concept, operation.changes);
                }
                break;
            case 'add-concept':
                ontology.concepts.push(operation.concept);
                break;
            case 'delete-concept':
                const index = ontology.concepts.findIndex(c => c.id === operation.conceptId);
                if (index !== -1) {
                    ontology.concepts.splice(index, 1);
                    ontology.isaLinks = ontology.isaLinks.filter(
                        isa => isa.parent !== operation.conceptId && isa.child !== operation.conceptId
                    );
                }
                break;
            case 'move-concept':
                const moveConcept = ontology.concepts.find(c => c.id === operation.conceptId);
                if (moveConcept) {
                    moveConcept.position = operation.position;
                }
                break;
            case 'add-isa':
                ontology.isaLinks.push(operation.isa);
                break;
            case 'delete-isa':
                const isaIndex = ontology.isaLinks.findIndex(i => i.id === operation.isaId);
                if (isaIndex !== -1) {
                    ontology.isaLinks.splice(isaIndex, 1);
                }
                break;
        }
    }

    sendOperation(operation) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'operation',
                operation
            }));
            this.applyOperation(operation);
            this.renderOntology();
        }
    }

    // --- UI表示 ---

    showEditor() {
        this.elements.welcomeScreen.style.display = 'none';
        this.elements.canvas.style.display = 'block';
        this.elements.zoomControls.style.display = 'flex';
        this.elements.btnDownload.disabled = false;
        this.elements.filename.textContent = this.state.ontology.filename;

        // URLを更新
        const url = new URL(window.location);
        url.searchParams.set('session', this.state.sessionId);
        window.history.pushState({}, '', url);
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.elements.statusConnection.textContent = '🟢 接続中';
            this.elements.statusConnection.classList.add('connected');
            this.elements.statusConnection.classList.remove('disconnected');
        } else {
            this.elements.statusConnection.textContent = '🔴 切断';
            this.elements.statusConnection.classList.add('disconnected');
            this.elements.statusConnection.classList.remove('connected');
        }
    }

    updateUsersList() {
        const indicator = this.elements.usersIndicator;
        indicator.innerHTML = '';

        this.state.users.forEach(user => {
            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.style.backgroundColor = user.color;
            avatar.textContent = user.userName.charAt(0).toUpperCase();
            avatar.title = user.userName;
            indicator.appendChild(avatar);
        });
    }

    showNotification(message) {
        this.elements.statusInfo.textContent = message;
        setTimeout(() => {
            this.elements.statusInfo.textContent = '法造 同時編集システム v1.0';
        }, 3000);
    }

    // --- オントロジー描画 ---

    renderOntology() {
        if (!this.state.ontology) return;

        const { concepts, isaLinks } = this.state.ontology;

        // 概念リストを更新
        this.renderConceptList(concepts);

        // ISAリンクを描画
        this.renderIsaLinks(isaLinks, concepts);

        // 概念ノードを描画
        this.renderConcepts(concepts);

        // ステータス更新
        this.elements.statusConcepts.textContent = `概念: ${concepts.length}`;
        this.elements.statusRelations.textContent = `関係: ${isaLinks.length}`;
    }

    renderConceptList(concepts) {
        const list = this.elements.conceptList;
        list.innerHTML = '';

        concepts.forEach(concept => {
            const item = document.createElement('li');
            item.className = 'concept-list-item';
            if (this.state.selectedConcept === concept.id) {
                item.classList.add('selected');
            }
            item.innerHTML = `
        <span class="concept-icon">📦</span>
        <span>${concept.label}</span>
      `;
            item.addEventListener('click', () => this.selectConcept(concept.id));
            list.appendChild(item);
        });
    }

    renderConcepts(concepts) {
        const group = this.elements.conceptsGroup;
        group.innerHTML = '';

        concepts.forEach(concept => {
            const node = this.createConceptNode(concept);
            group.appendChild(node);
        });
    }

    createConceptNode(concept) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'concept-node');
        g.setAttribute('data-id', concept.id);
        g.setAttribute('transform', `translate(${concept.position.x}, ${concept.position.y})`);

        if (this.state.selectedConcept === concept.id) {
            g.classList.add('selected');
        }

        // ノードのサイズを計算
        const labelWidth = Math.max(80, concept.label.length * 12 + 20);
        const labelHeight = 36;

        // 背景矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'concept-body');
        rect.setAttribute('x', -labelWidth / 2);
        rect.setAttribute('y', -labelHeight / 2);
        rect.setAttribute('width', labelWidth);
        rect.setAttribute('height', labelHeight);
        g.appendChild(rect);

        // ラベル
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'concept-label');
        text.textContent = concept.label;
        g.appendChild(text);

        // イベントリスナー
        g.addEventListener('mousedown', (e) => this.handleConceptMouseDown(e, concept));
        g.addEventListener('dblclick', () => this.editConceptLabel(concept));

        return g;
    }

    renderIsaLinks(isaLinks, concepts) {
        const group = this.elements.isaLinksGroup;
        group.innerHTML = '';

        isaLinks.forEach(isa => {
            const parentConcept = concepts.find(c => c.label === isa.parent);
            const childConcept = concepts.find(c => c.label === isa.child);

            if (parentConcept && childConcept) {
                const line = this.createIsaLink(isa, parentConcept, childConcept);
                group.appendChild(line);
            }
        });
    }

    createIsaLink(isa, parent, child) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'isa-link');
        line.setAttribute('data-id', isa.id);
        line.setAttribute('x1', parent.position.x);
        line.setAttribute('y1', parent.position.y);
        line.setAttribute('x2', child.position.x);
        line.setAttribute('y2', child.position.y);
        line.setAttribute('marker-end', 'url(#arrow)');

        return line;
    }

    // --- 概念操作 ---

    selectConcept(conceptId) {
        this.state.selectedConcept = conceptId;
        this.renderOntology();
        this.showConceptDetail(conceptId);
    }

    handleConceptMouseDown(e, concept) {
        e.stopPropagation();

        if (this.state.tool === 'select') {
            this.selectConcept(concept.id);
            this.state.isDragging = true;
            this.state.dragStart = {
                x: e.clientX,
                y: e.clientY,
                conceptX: concept.position.x,
                conceptY: concept.position.y,
                conceptId: concept.id
            };
        } else if (this.state.tool === 'delete') {
            this.deleteConcept(concept.id);
        }
    }

    editConceptLabel(concept) {
        const newLabel = prompt('概念名を入力:', concept.label);
        if (newLabel && newLabel !== concept.label) {
            this.sendOperation({
                type: 'update-concept',
                conceptId: concept.id,
                changes: { label: newLabel }
            });
        }
    }

    addConcept(x, y) {
        const label = prompt('新しい概念名を入力:');
        if (!label) return;

        const id = `${Date.now()}_n${Math.random().toString(36).substr(2, 9)}`;
        const concept = {
            id,
            label,
            position: { x, y },
            slots: []
        };

        this.sendOperation({
            type: 'add-concept',
            concept
        });
    }

    deleteConcept(conceptId) {
        if (confirm('この概念を削除しますか？')) {
            this.sendOperation({
                type: 'delete-concept',
                conceptId
            });
            this.state.selectedConcept = null;
            this.closeDetailPanel();
        }
    }

    showConceptDetail(conceptId) {
        const concept = this.state.ontology.concepts.find(c => c.id === conceptId);
        if (!concept) return;

        this.elements.detailPanel.classList.add('open');

        let slotsHtml = '';
        if (concept.slots && concept.slots.length > 0) {
            slotsHtml = `
        <div class="slots-list">
          <h4>スロット</h4>
          ${concept.slots.map(slot => `
            <div class="slot-item">
              <div class="slot-header">
                <span class="slot-role">${slot.role}</span>
                <span class="slot-constraint">${slot.classConstraint}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
        }

        this.elements.detailContent.innerHTML = `
      <div class="detail-field">
        <label>概念名</label>
        <input type="text" id="edit-label" value="${concept.label}">
      </div>
      <div class="detail-field">
        <label>ID</label>
        <input type="text" value="${concept.id}" readonly>
      </div>
      <div class="detail-field">
        <label>位置</label>
        <input type="text" value="X: ${concept.position.x}, Y: ${concept.position.y}" readonly>
      </div>
      ${slotsHtml}
      <button class="btn btn-primary" style="width: 100%; margin-top: 16px;" onclick="app.updateConceptFromDetail('${concept.id}')">
        更新
      </button>
    `;
    }

    updateConceptFromDetail(conceptId) {
        const newLabel = document.getElementById('edit-label').value;
        const concept = this.state.ontology.concepts.find(c => c.id === conceptId);

        if (concept && newLabel !== concept.label) {
            this.sendOperation({
                type: 'update-concept',
                conceptId,
                changes: { label: newLabel }
            });
        }
    }

    closeDetailPanel() {
        this.elements.detailPanel.classList.remove('open');
    }

    filterConcepts(query) {
        const items = this.elements.conceptList.querySelectorAll('.concept-list-item');
        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const label = item.textContent.toLowerCase();
            item.style.display = label.includes(lowerQuery) ? '' : 'none';
        });
    }

    // --- キャンバス操作 ---

    handleCanvasMouseDown(e) {
        if (e.target === this.elements.canvas || e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'url(#grid)') {
            if (this.state.tool === 'add') {
                const point = this.getCanvasPoint(e);
                this.addConcept(point.x, point.y);
            } else {
                // パン開始
                this.state.isDragging = true;
                this.state.dragStart = {
                    x: e.clientX,
                    y: e.clientY,
                    panX: this.state.pan.x,
                    panY: this.state.pan.y
                };
            }
        }
    }

    handleCanvasMouseMove(e) {
        // カーソル位置をブロードキャスト
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const point = this.getCanvasPoint(e);
            this.ws.send(JSON.stringify({
                type: 'cursor',
                cursor: point
            }));
        }

        if (!this.state.isDragging) return;

        if (this.state.dragStart.conceptId) {
            // 概念のドラッグ
            const dx = (e.clientX - this.state.dragStart.x) / this.state.zoom;
            const dy = (e.clientY - this.state.dragStart.y) / this.state.zoom;

            const newX = Math.round(this.state.dragStart.conceptX + dx);
            const newY = Math.round(this.state.dragStart.conceptY + dy);

            const concept = this.state.ontology.concepts.find(c => c.id === this.state.dragStart.conceptId);
            if (concept) {
                concept.position = { x: newX, y: newY };
                this.renderOntology();
            }
        } else {
            // キャンバスのパン
            const dx = e.clientX - this.state.dragStart.x;
            const dy = e.clientY - this.state.dragStart.y;

            this.state.pan.x = this.state.dragStart.panX + dx;
            this.state.pan.y = this.state.dragStart.panY + dy;

            this.updateCanvasTransform();
        }
    }

    handleCanvasMouseUp(e) {
        if (this.state.isDragging && this.state.dragStart.conceptId) {
            // 概念の移動操作を送信
            const concept = this.state.ontology.concepts.find(c => c.id === this.state.dragStart.conceptId);
            if (concept) {
                this.sendOperation({
                    type: 'move-concept',
                    conceptId: concept.id,
                    position: concept.position
                });
            }
        }

        this.state.isDragging = false;
        this.state.dragStart = null;
    }

    handleCanvasWheel(e) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.1, Math.min(3, this.state.zoom + delta));

        this.state.zoom = newZoom;
        this.updateCanvasTransform();
        this.elements.zoomLevel.textContent = `${Math.round(newZoom * 100)}%`;
    }

    getCanvasPoint(e) {
        const rect = this.elements.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.state.pan.x) / this.state.zoom,
            y: (e.clientY - rect.top - this.state.pan.y) / this.state.zoom
        };
    }

    updateCanvasTransform() {
        this.elements.canvasContent.setAttribute(
            'transform',
            `translate(${this.state.pan.x}, ${this.state.pan.y}) scale(${this.state.zoom})`
        );
    }

    zoomIn() {
        this.state.zoom = Math.min(3, this.state.zoom + 0.2);
        this.updateCanvasTransform();
        this.elements.zoomLevel.textContent = `${Math.round(this.state.zoom * 100)}%`;
    }

    zoomOut() {
        this.state.zoom = Math.max(0.1, this.state.zoom - 0.2);
        this.updateCanvasTransform();
        this.elements.zoomLevel.textContent = `${Math.round(this.state.zoom * 100)}%`;
    }

    zoomFit() {
        this.state.zoom = 1;
        this.state.pan = { x: 50, y: 50 };
        this.updateCanvasTransform();
        this.elements.zoomLevel.textContent = '100%';
    }

    // --- ツール ---

    setTool(tool) {
        this.state.tool = tool;

        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));

        switch (tool) {
            case 'select':
                this.elements.toolSelect.classList.add('active');
                break;
            case 'add':
                this.elements.toolAdd.classList.add('active');
                break;
            case 'connect':
                this.elements.toolConnect.classList.add('active');
                break;
            case 'delete':
                this.elements.toolDelete.classList.add('active');
                break;
        }
    }

    // --- カーソル表示 ---

    updateCursor(userId, userName, color, cursor) {
        let cursorEl = document.getElementById(`cursor-${userId}`);

        if (!cursorEl) {
            cursorEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            cursorEl.id = `cursor-${userId}`;
            cursorEl.setAttribute('class', 'user-cursor');
            cursorEl.innerHTML = `
        <polygon class="cursor-pointer" points="0,0 0,18 5,14 9,22 12,21 8,13 14,13" style="color: ${color}"/>
        <rect class="cursor-label-bg" x="14" y="14" width="${userName.length * 8 + 8}" height="18" fill="${color}"/>
        <text class="cursor-label" x="18" y="26">${userName}</text>
      `;
            this.elements.cursorsGroup.appendChild(cursorEl);
        }

        cursorEl.setAttribute('transform', `translate(${cursor.x}, ${cursor.y})`);
    }

    removeCursor(userId) {
        const cursorEl = document.getElementById(`cursor-${userId}`);
        if (cursorEl) {
            cursorEl.remove();
        }
    }

    // --- 共有 ---

    showShareModal() {
        const shareUrl = window.location.href;
        this.elements.shareLink.value = shareUrl;
        this.elements.shareModal.style.display = 'flex';
    }

    hideShareModal() {
        this.elements.shareModal.style.display = 'none';
    }

    copyShareLink() {
        this.elements.shareLink.select();
        document.execCommand('copy');
        this.elements.btnCopyLink.textContent = 'コピーしました！';
        setTimeout(() => {
            this.elements.btnCopyLink.textContent = 'コピー';
        }, 2000);
    }

    // --- ダウンロード ---

    async downloadXml() {
        if (!this.state.sessionId) return;

        try {
            const response = await fetch(`/api/download/${this.state.sessionId}`);
            const blob = await response.blob();

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.state.ontology.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            alert('ダウンロードに失敗しました');
        }
    }
}

// アプリケーション初期化
const app = new HozoCollabApp();
