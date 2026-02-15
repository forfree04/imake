
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  runApp(const ImakeApp());
}

/// =======================
/// Design policy (default)
/// =======================
/// - Width: 430px (desktop/web) constraint
/// - Font: Pretendard (fallback to system if not bundled)
/// - Font sizes: Title 16, Body 14
class ImakeApp extends StatelessWidget {
  const ImakeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..load(),
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'imake prototype',
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xFF3B82F6),
          fontFamily: 'Pretendard',
          textTheme: const TextTheme(
            titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            bodyMedium: TextStyle(fontSize: 14),
          ),
        ),
        home: const Shell(),
      ),
    );
  }
}

/// =======================
/// Data models
/// =======================
class TodoItem {
  TodoItem({
    required this.id,
    required this.title,
    this.date, // yyyy-MM-dd
    this.time, // HH:mm
    this.done = false,
    required this.createdAt,
  });

  final int id;
  String title;
  String? date;
  String? time;
  bool done;
  final int createdAt;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'date': date,
        'time': time,
        'done': done,
        'createdAt': createdAt,
      };

  static TodoItem fromJson(Map<String, dynamic> m) => TodoItem(
        id: m['id'],
        title: m['title'],
        date: m['date'],
        time: m['time'],
        done: m['done'] ?? false,
        createdAt: m['createdAt'] ?? DateTime.now().millisecondsSinceEpoch,
      );
}

class FavoriteItem {
  FavoriteItem({
    required this.id,
    required this.title,
    required this.cat,
    this.date, // yyyy-MM-dd
    this.time, // HH:mm
    this.placeId,
    this.lat,
    this.lng,
  });

  final int id;
  String title;
  String cat;

  /// Favorites edit: date + time
  String? date;
  String? time;

  /// Map integration-ready fields (later)
  String? placeId;
  double? lat;
  double? lng;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'cat': cat,
        'date': date,
        'time': time,
        'placeId': placeId,
        'lat': lat,
        'lng': lng,
      };

  static FavoriteItem fromJson(Map<String, dynamic> m) => FavoriteItem(
        id: m['id'],
        title: m['title'],
        cat: m['cat'] ?? 'Activity',
        date: m['date'],
        time: m['time'],
        placeId: m['placeId'],
        lat: (m['lat'] as num?)?.toDouble(),
        lng: (m['lng'] as num?)?.toDouble(),
      );
}

class ScheduleItem {
  ScheduleItem({
    required this.id,
    required this.title,
    this.date, // yyyy-MM-dd (default today)
    this.time, // HH:mm
    this.done = false,
  });

  final int id;
  String title;
  String? date;
  String? time;
  bool done;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'date': date,
        'time': time,
        'done': done,
      };

  static ScheduleItem fromJson(Map<String, dynamic> m) => ScheduleItem(
        id: m['id'],
        title: m['title'],
        date: m['date'],
        time: m['time'],
        done: m['done'] ?? false,
      );
}

/// =======================
/// App State (prototype)
/// =======================
class AppState extends ChangeNotifier {
  bool helpOpen = false;

  List<TodoItem> todo = [];
  List<FavoriteItem> favorites = [];
  List<ScheduleItem> schedule = [];

  int totalSavedWon = 5000; // demo
  String weatherStub = '☀️ 3°C'; // demo

  static const _kStoreKey = 'imake_proto_state_v1';

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_kStoreKey);
      if (raw == null || raw.isEmpty) {
        _seed();
        notifyListeners();
        return;
      }
      final m = jsonDecode(raw) as Map<String, dynamic>;
      todo = (m['todo'] as List? ?? []).map((e) => TodoItem.fromJson(e)).toList();
      favorites =
          (m['favorites'] as List? ?? []).map((e) => FavoriteItem.fromJson(e)).toList();
      schedule =
          (m['schedule'] as List? ?? []).map((e) => ScheduleItem.fromJson(e)).toList();

      _normalizeTodoToSchedule();
      _sortTodo();
      notifyListeners();
    } catch (_) {
      _seed();
      notifyListeners();
    }
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    final m = {
      'todo': todo.map((e) => e.toJson()).toList(),
      'favorites': favorites.map((e) => e.toJson()).toList(),
      'schedule': schedule.map((e) => e.toJson()).toList(),
    };
    await prefs.setString(_kStoreKey, jsonEncode(m));
  }

  void _seed() {
    todo = [
      TodoItem(
        id: _id(),
        title: 'Rent Hanbok',
        createdAt: DateTime.now().millisecondsSinceEpoch,
      )
    ];
    favorites = [
      FavoriteItem(id: _id(), title: 'Gyeongbokgung', cat: 'Activity'),
    ];
    schedule = [];
    _normalizeTodoToSchedule();
    _sortTodo();
  }

  static int _id() => DateTime.now().microsecondsSinceEpoch;

  static String todayYmd() {
    final now = DateTime.now();
    final mm = now.month.toString().padLeft(2, '0');
    final dd = now.day.toString().padLeft(2, '0');
    return '${now.year}-$mm-$dd';
  }

  static String nowHm() {
    final now = DateTime.now();
    final hh = now.hour.toString().padLeft(2, '0');
    final mm = now.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  void toggleHelp() {
    helpOpen = !helpOpen;
    notifyListeners();
  }

  void closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    notifyListeners();
  }

  // ---- Todo
  void addTodo(TodoItem item) {
    todo.add(item);
    _normalizeTodoToSchedule();
    _sortTodo();
    notifyListeners();
    save();
  }

  void updateTodo(int id, {required String title, String? date, String? time}) {
    final t = todo.firstWhere((e) => e.id == id);
    t.title = title;
    t.date = (date != null && date.isEmpty) ? null : date;
    t.time = (time != null && time.isEmpty) ? null : time;
    _normalizeTodoToSchedule();
    _sortTodo();
    notifyListeners();
    save();
  }

  void toggleTodoDone(int id) {
    final t = todo.firstWhere((e) => e.id == id);
    t.done = !t.done;
    _sortTodo();
    notifyListeners();
    save();
  }

  void deleteTodo(int id) {
    todo.removeWhere((e) => e.id == id);
    notifyListeners();
    save();
  }

  // 정책: todo 중 '오늘 날짜'는 schedule로 자동 이동
  void _normalizeTodoToSchedule() {
    final today = todayYmd();
    final moving = todo.where((t) => t.date == today).toList();
    if (moving.isEmpty) return;

    for (final t in moving) {
      schedule.add(ScheduleItem(
        id: _id(),
        title: t.title,
        date: today,
        time: t.time,
        done: false,
      ));
      todo.removeWhere((x) => x.id == t.id);
    }
  }

  void _sortTodo() {
    todo.sort((a, b) {
      if (a.done != b.done) return a.done ? 1 : -1;

      final ad = a.date;
      final bd = b.date;
      if (ad != null && bd != null) {
        final c = ad.compareTo(bd);
        if (c != 0) return c;
        return (a.time ?? '').compareTo(b.time ?? '');
      }
      if (ad != null && bd == null) return -1;
      if (ad == null && bd != null) return 1;
      return a.createdAt.compareTo(b.createdAt);
    });
  }

  // ---- Favorites
  void updateFavorite(int id, {String? date, String? time}) {
    final f = favorites.firstWhere((e) => e.id == id);
    f.date = (date != null && date.isEmpty) ? null : date;
    f.time = (time != null && time.isEmpty) ? null : time;
    notifyListeners();
    save();
  }

  void deleteFavorite(int id) {
    favorites.removeWhere((e) => e.id == id);
    notifyListeners();
    save();
  }

  // ---- Schedule
  List<ScheduleItem> todaySchedule() {
    final today = todayYmd();
    return schedule.where((s) => (s.date ?? today) == today).toList();
  }

  void addSchedule(ScheduleItem item) {
    schedule.add(item);
    notifyListeners();
    save();
  }

  void updateSchedule(int id, {required String title, String? time}) {
    final s = schedule.firstWhere((e) => e.id == id);
    s.title = title;
    s.time = (time != null && time.isEmpty) ? null : time;
    notifyListeners();
    save();
  }

  void toggleScheduleDone(int id) {
    final s = schedule.firstWhere((e) => e.id == id);
    s.done = !s.done;
    notifyListeners();
    save();
  }

  void deleteSchedule(int id) {
    schedule.removeWhere((e) => e.id == id);
    notifyListeners();
    save();
  }
}

/// =======================
/// Shell (Header + Help overlay + Tabs)
/// =======================
class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int tab = 0;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Shortcuts(
      shortcuts: <LogicalKeySet, Intent>{
        LogicalKeySet(LogicalKeyboardKey.escape): const _CloseHelpIntent(),
      },
      child: Actions(
        actions: <Type, Action<Intent>>{
          _CloseHelpIntent: CallbackAction<_CloseHelpIntent>(
            onInvoke: (intent) => state.closeHelp(),
          )
        },
        child: Scaffold(
          backgroundColor: const Color(0xFFCBD5E1),
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: ClipRRect(
                borderRadius: const BorderRadius.all(Radius.circular(28)),
                child: Container(
                  color: Colors.white,
                  child: SafeArea(
                    top: true,
                    bottom: false,
                    child: Column(
                      children: [
                        const _Header(),
                        Expanded(
                          child: Stack(
                            children: [
                              Positioned.fill(
                                child: IgnorePointer(
                                  ignoring: state.helpOpen,
                                  child: IndexedStack(
                                    index: tab,
                                    children: const [
                                      HomePage(),
                                      MapPageStub(),
                                      MyFitPageStub(),
                                      HistoryPageStub(),
                                      MyPageStub(),
                                    ],
                                  ),
                                ),
                              ),
                              if (state.helpOpen)
                                Positioned.fill(
                                  child: GestureDetector(
                                    onTap: state.closeHelp,
                                    child: Container(
                                      color: Colors.black.withOpacity(0.35),
                                    ),
                                  ),
                                ),
                              const _HelpOverlay(),
                            ],
                          ),
                        ),
                        _BottomNav(
                          tab: tab,
                          onChange: (i) => setState(() => tab = i),
                        )
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CloseHelpIntent extends Intent {
  const _CloseHelpIntent();
}

/// =======================
/// Header
/// =======================
class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      height: 60,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'imake',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: theme.colorScheme.primary,
                  fontStyle: FontStyle.italic,
                  fontWeight: FontWeight.w900,
                  fontSize: 20,
                ),
              ),
            ),
          ),
          Expanded(
            child: Center(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _openQRModal(context),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.qr_code, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        'My QR',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: () => _openLangModal(context),
                    icon: const Icon(Icons.language),
                    splashRadius: 20,
                  ),
                  IconButton(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Hamburger menu (stub)')),
                      );
                    },
                    icon: const Icon(Icons.menu),
                    splashRadius: 20,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openQRModal(BuildContext context) {
    _showBottomSheet(
      context,
      title: 'My QR Code',
      showAdd: false,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              Icon(Icons.qr_code_2, size: 120),
              SizedBox(height: 10),
              Text('멤버십 상태/할인/바우처 안내는 추후 연결'),
            ],
          ),
        ),
      ),
    );
  }

  void _openLangModal(BuildContext context) {
    _showBottomSheet(
      context,
      title: 'Language',
      showAdd: false,
      body: Column(
        mainAxisSize: MainAxisSize.min,
        children: const [
          _ActionTile(icon: Icons.flag, label: '한국어'),
          _ActionTile(icon: Icons.flag, label: 'English'),
          _ActionTile(icon: Icons.flag, label: '日本語'),
          _ActionTile(icon: Icons.flag, label: '中文'),
        ],
      ),
    );
  }
}

/// =======================
/// Help overlay (over content)
/// =======================
class _HelpOverlay extends StatelessWidget {
  const _HelpOverlay();

  static const double panelH = 420;
  static const double tabH = 28;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final primary = Theme.of(context).colorScheme.primary;

    final dy = state.helpOpen ? 0.0 : -panelH;

    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Transform.translate(
        offset: Offset(0, dy),
        child: SizedBox(
          height: panelH + tabH,
          child: Stack(
            children: [
              Container(
                height: panelH,
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border(bottom: BorderSide(color: primary, width: 3)),
                  boxShadow: const [BoxShadow(blurRadius: 14, color: Colors.black12)],
                ),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.call),
                      label: const Text('1330 관광통역안내'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'ⓘ 정부기관 운영 실시간 통역서비스 24h / 이용료 무료 / 통화료 별도',
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 14),
                    const Text('EMBASSY (가입 국가 기반: 스텁)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                    const SizedBox(height: 8),
                    _Card(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text('Embassy of (TBD)', style: TextStyle(fontWeight: FontWeight.w900)),
                          SizedBox(height: 4),
                          Text('Phone: (TBD) / Address: (TBD)', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('MY LOCATION', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () {},
                            child: const Text('복사'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () {},
                            child: const Text('전송'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'ⓘ 내 위치 정보를 복사/전송합니다(지정 번호).',
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 14),
                    const Text('TRANSLATOR (프로토타입)', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
                    const SizedBox(height: 8),
                    const TextField(
                      maxLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Type to translate...',
                        filled: true,
                        fillColor: Color(0xFFF1F5F9),
                        border: OutlineInputBorder(borderSide: BorderSide.none),
                      ),
                    ),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.sos),
                      label: const Text('SOS 전송(프로토타입)'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFEF4444),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                top: panelH,
                left: 0,
                right: 0,
                height: tabH,
                child: Center(
                  child: SizedBox(
                    width: 86,
                    height: tabH,
                    child: ElevatedButton(
                      onPressed: () => context.read<AppState>().toggleHelp(),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.zero,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.only(
                            bottomLeft: Radius.circular(12),
                            bottomRight: Radius.circular(12),
                          ),
                        ),
                        elevation: 2,
                      ),
                      child: Text(
                        state.helpOpen ? 'HELP ▴' : 'HELP ▾',
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// =======================
/// Home page + modals
/// =======================
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final primary = Theme.of(context).colorScheme.primary;

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 42, 14, 90), // includes help tab space
      children: [
        Row(
          children: [
            Expanded(
              child: _DashCard(
                label: 'TOTAL TO DO',
                value: state.todo.length.toString(),
                onTap: () => openTodoModal(context),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DashCard(
                label: 'FAVORITES',
                value: state.favorites.length.toString(),
                onTap: () => openFavModal(context),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _DashCard(
                label: 'TODAY SCH',
                value: state.todaySchedule().length.toString(),
                onTap: () => openScheduleModal(context),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _Card(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total Saved', style: TextStyle(fontWeight: FontWeight.w900)),
                    Text('₩ ${state.totalSavedWon}',
                        style: TextStyle(fontWeight: FontWeight.w900, color: primary)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            _Card(child: Text(state.weatherStub, style: const TextStyle(fontWeight: FontWeight.w900))),
          ],
        ),
        const SizedBox(height: 12),
        _CategoryGrid(onTap: (cat) {}),
        const SizedBox(height: 12),
        Container(
          height: 160,
          decoration: BoxDecoration(
            color: const Color(0xFFE0F2FE),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.9),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('Smart Guide Map (stub)',
                  style: TextStyle(fontWeight: FontWeight.w900, color: primary, fontSize: 12)),
            ),
          ),
        ),
        const SizedBox(height: 12),
        const Text('Recommended', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        SizedBox(
          height: 155,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: const [
              _RecCard(title: 'Gyeongbokgung', status: 'green'),
              _RecCard(title: 'N Tower', status: 'yellow'),
              _RecCard(title: 'Lotte World', status: 'red'),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- Todo modal ----------
  void openTodoModal(BuildContext context) {
    final state = context.read<AppState>();
    _showBottomSheet(
      context,
      title: 'To-Do List',
      showAdd: true,
      onAdd: () => _openTodoAdd(context),
      body: Consumer<AppState>(
        builder: (_, s, __) {
          final items = List<TodoItem>.from(s.todo);
          return items.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('비어 있습니다.', style: TextStyle(color: Color(0xFF64748B))),
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: items
                      .map((t) => _TodoRow(
                            item: t,
                            onToggle: () => s.toggleTodoDone(t.id),
                            onEdit: () => _openTodoEdit(context, t),
                            onDelete: () => _confirm(
                              context,
                              title: '삭제',
                              message: '이 항목을 삭제하시겠습니까?',
                              okText: '삭제',
                              onOk: () => s.deleteTodo(t.id),
                            ),
                          ))
                      .toList(),
                );
        },
      ),
    );
  }

  void _openTodoAdd(BuildContext context) {
    final state = context.read<AppState>();
    final titleCtrl = TextEditingController();
    String? date;
    String? time;

    _showFormDialog(
      context,
      title: 'To-Do 추가',
      content: StatefulBuilder(
        builder: (ctx, setSt) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: '제목')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                        initialDate: DateTime.now(),
                      );
                      if (picked == null) return;
                      final y = picked.year.toString();
                      final m = picked.month.toString().padLeft(2, '0');
                      final d = picked.day.toString().padLeft(2, '0');
                      setSt(() => date = '$y-$m-$d');
                    },
                    child: Text(date ?? '날짜 선택'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
                      if (picked == null) return;
                      final hh = picked.hour.toString().padLeft(2, '0');
                      final mm = picked.minute.toString().padLeft(2, '0');
                      setSt(() => time = '$hh:$mm');
                    },
                    child: Text(time ?? '시간 선택'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text('ⓘ 날짜가 오늘인 경우 저장 시 Schedule로 자동 이동합니다.',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          ],
        ),
      ),
      onOk: () {
        final title = titleCtrl.text.trim();
        if (title.isEmpty) return;
        state.addTodo(TodoItem(
          id: DateTime.now().microsecondsSinceEpoch,
          title: title,
          date: date,
          time: time,
          createdAt: DateTime.now().millisecondsSinceEpoch,
        ));
        Navigator.of(context).pop();
      },
    );
  }

  void _openTodoEdit(BuildContext context, TodoItem t) {
    final state = context.read<AppState>();
    final titleCtrl = TextEditingController(text: t.title);
    String? date = t.date;
    String? time = t.time;

    _showFormDialog(
      context,
      title: 'To-Do 편집',
      content: StatefulBuilder(
        builder: (ctx, setSt) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: '제목')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                        initialDate: DateTime.now(),
                      );
                      if (picked == null) return;
                      final y = picked.year.toString();
                      final m = picked.month.toString().padLeft(2, '0');
                      final d = picked.day.toString().padLeft(2, '0');
                      setSt(() => date = '$y-$m-$d');
                    },
                    child: Text(date ?? '날짜 선택'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
                      if (picked == null) return;
                      final hh = picked.hour.toString().padLeft(2, '0');
                      final mm = picked.minute.toString().padLeft(2, '0');
                      setSt(() => time = '$hh:$mm');
                    },
                    child: Text(time ?? '시간 선택'),
                  ),
                ),
              ],
            ),
            TextButton(
              onPressed: () => setSt(() {
                date = null;
                time = null;
              }),
              child: const Text('날짜/시간 지우기'),
            )
          ],
        ),
      ),
      onOk: () {
        final title = titleCtrl.text.trim();
        if (title.isEmpty) return;
        state.updateTodo(t.id, title: title, date: date, time: time);
        Navigator.of(context).pop();
      },
    );
  }

  // ---------- Favorites modal ----------
  void openFavModal(BuildContext context) {
    _showBottomSheet(
      context,
      title: 'Favorites',
      showAdd: false,
      body: Consumer<AppState>(
        builder: (_, s, __) {
          if (s.favorites.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Text('비어 있습니다.', style: TextStyle(color: Color(0xFF64748B))),
            );
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: s.favorites
                .map(
                  (f) => _FavRow(
                    item: f,
                    onEdit: () => _openFavEdit(context, f),
                    onDelete: () => _confirm(
                      context,
                      title: '삭제',
                      message: '즐겨찾기를 삭제하시겠습니까?',
                      okText: '삭제',
                      onOk: () => s.deleteFavorite(f.id),
                    ),
                  ),
                )
                .toList(),
          );
        },
      ),
    );
  }

  void _openFavEdit(BuildContext context, FavoriteItem f) {
    final state = context.read<AppState>();
    String? date = f.date;
    String? time = f.time;

    _showFormDialog(
      context,
      title: 'Favorite 편집',
      content: StatefulBuilder(
        builder: (ctx, setSt) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Card(
              child: Row(
                children: [
                  _Badge(text: f.cat),
                  const SizedBox(width: 10),
                  Expanded(child: Text(f.title, style: const TextStyle(fontWeight: FontWeight.w900))),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        firstDate: DateTime(2020),
                        lastDate: DateTime(2100),
                        initialDate: DateTime.now(),
                      );
                      if (picked == null) return;
                      final y = picked.year.toString();
                      final m = picked.month.toString().padLeft(2, '0');
                      final d = picked.day.toString().padLeft(2, '0');
                      setSt(() => date = '$y-$m-$d');
                    },
                    child: Text(date ?? '날짜 선택'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
                      if (picked == null) return;
                      final hh = picked.hour.toString().padLeft(2, '0');
                      final mm = picked.minute.toString().padLeft(2, '0');
                      setSt(() => time = '$hh:$mm');
                    },
                    child: Text(time ?? '시간 선택'),
                  ),
                ),
              ],
            ),
            TextButton(
              onPressed: () => setSt(() {
                date = null;
                time = null;
              }),
              child: const Text('날짜/시간 지우기'),
            )
          ],
        ),
      ),
      onOk: () {
        state.updateFavorite(f.id, date: date, time: time);
        Navigator.of(context).pop();
      },
    );
  }

  // ---------- Schedule modal ----------
  void openScheduleModal(BuildContext context) {
    _showBottomSheet(
      context,
      title: 'Today Schedule',
      showAdd: true,
      onAdd: () => _openScheduleAdd(context),
      body: Consumer<AppState>(
        builder: (_, s, __) {
          final items = s.todaySchedule();
          if (items.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Text('비어 있습니다.', style: TextStyle(color: Color(0xFF64748B))),
            );
          }
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: items
                .map(
                  (it) => _ScheduleRow(
                    item: it,
                    onToggle: () => s.toggleScheduleDone(it.id),
                    onEdit: () => _openScheduleEdit(context, it),
                    onDelete: () => _confirm(
                      context,
                      title: '삭제',
                      message: '이 일정을 삭제하시겠습니까?',
                      okText: '삭제',
                      onOk: () => s.deleteSchedule(it.id),
                    ),
                  ),
                )
                .toList(),
          );
        },
      ),
    );
  }

  void _openScheduleAdd(BuildContext context) {
    final state = context.read<AppState>();
    final titleCtrl = TextEditingController();
    String? time;

    _showFormDialog(
      context,
      title: 'Schedule 추가',
      content: StatefulBuilder(
        builder: (ctx, setSt) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: '제목')),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () async {
                final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
                if (picked == null) return;
                final hh = picked.hour.toString().padLeft(2, '0');
                final mm = picked.minute.toString().padLeft(2, '0');
                setSt(() => time = '$hh:$mm');
              },
              child: Text(time ?? '시간 선택'),
            ),
          ],
        ),
      ),
      onOk: () {
        final title = titleCtrl.text.trim();
        if (title.isEmpty) return;
        state.addSchedule(ScheduleItem(
          id: DateTime.now().microsecondsSinceEpoch,
          title: title,
          date: AppState.todayYmd(),
          time: time,
        ));
        Navigator.of(context).pop();
      },
    );
  }

  void _openScheduleEdit(BuildContext context, ScheduleItem s) {
    final state = context.read<AppState>();
    final titleCtrl = TextEditingController(text: s.title);
    String? time = s.time;

    _showFormDialog(
      context,
      title: 'Schedule 편집',
      content: StatefulBuilder(
        builder: (ctx, setSt) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: '제목')),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () async {
                final picked = await showTimePicker(context: ctx, initialTime: TimeOfDay.now());
                if (picked == null) return;
                final hh = picked.hour.toString().padLeft(2, '0');
                final mm = picked.minute.toString().padLeft(2, '0');
                setSt(() => time = '$hh:$mm');
              },
              child: Text(time ?? '시간 선택'),
            ),
            TextButton(onPressed: () => setSt(() => time = null), child: const Text('시간 지우기')),
          ],
        ),
      ),
      onOk: () {
        final title = titleCtrl.text.trim();
        if (title.isEmpty) return;
        state.updateSchedule(s.id, title: title, time: time);
        Navigator.of(context).pop();
      },
    );
  }

  void _confirm(
    BuildContext context, {
    required String title,
    required String message,
    required String okText,
    required VoidCallback onOk,
  }) {
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('취소')),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              onOk();
            },
            child: Text(okText),
          ),
        ],
      ),
    );
  }
}

/// =======================
/// Stub pages
/// =======================
class MapPageStub extends StatelessWidget {
  const MapPageStub({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 42, 14, 90),
      children: const [
        Text('Map (stub)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        SizedBox(height: 10),
        Text('지도 API 연동 후 Favorites/Schedule 레이어 고정 표시로 확장합니다.'),
      ],
    );
  }
}

class MyFitPageStub extends StatelessWidget {
  const MyFitPageStub({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 42, 14, 90),
      children: const [
        Text('My Fit (stub)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        SizedBox(height: 10),
        Text('국가/연령/취향 기반 추천 페이지(현재 위치 무관)'),
      ],
    );
  }
}

class HistoryPageStub extends StatelessWidget {
  const HistoryPageStub({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 42, 14, 90),
      children: const [
        Text('History (stub)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        SizedBox(height: 10),
        Text('방문 기록, 할인 내역, 주문 내역 등 추후 연결'),
      ],
    );
  }
}

class MyPageStub extends StatelessWidget {
  const MyPageStub({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 42, 14, 90),
      children: const [
        Text('My (stub)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
        SizedBox(height: 10),
        Text('프로필/설정/멤버십 연결 예정'),
      ],
    );
  }
}

/// =======================
/// Bottom navigation
/// =======================
class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.tab, required this.onChange});

  final int tab;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    final items = const [
      _NavItem(icon: Icons.home, label: 'Home'),
      _NavItem(icon: Icons.map, label: 'Map'),
      _NavItem(icon: Icons.auto_awesome, label: 'My Fit'),
      _NavItem(icon: Icons.history, label: 'History'),
      _NavItem(icon: Icons.person, label: 'My'),
    ];

    return Container(
      height: 85,
      padding: const EdgeInsets.only(bottom: 18),
      decoration: const BoxDecoration(
        color: Color.fromRGBO(255, 255, 255, 0.96),
        border: Border(top: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: Row(
        children: List.generate(items.length, (i) {
          final active = i == tab;
          final c = active ? Theme.of(context).colorScheme.primary : const Color(0xFF94A3B8);
          return Expanded(
            child: InkWell(
              onTap: () => onChange(i),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(items[i].icon, color: c),
                  const SizedBox(height: 4),
                  Text(items[i].label,
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: c)),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({required this.icon, required this.label});

  final IconData icon;
  final String label;
}

/// =======================
/// UI widgets
/// =======================
class _DashCard extends StatelessWidget {
  const _DashCard({required this.label, required this.value, required this.onTap});

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Column(
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: primary)),
          ],
        ),
      ),
    );
  }
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.onTap});

  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) {
    final cats = const [
      ('Food', Icons.restaurant),
      ('Cafe', Icons.coffee),
      ('Conv', Icons.store),
      ('Hair', Icons.cut),
      ('Act', Icons.local_activity),
      ('Shop', Icons.shopping_bag),
    ];

    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      children: cats.map((c) {
        return InkWell(
          onTap: () => onTap(c.$1),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: const Color(0xFFF1F5F9)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(c.$2, size: 16),
                const SizedBox(width: 6),
                Text(c.$1, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _RecCard extends StatelessWidget {
  const _RecCard({required this.title, required this.status});

  final String title;
  final String status;

  @override
  Widget build(BuildContext context) {
    Color dot;
    String label;
    switch (status) {
      case 'yellow':
        dot = const Color(0xFFF59E0B);
        label = '🟡 Busy (<15m)';
        break;
      case 'red':
        dot = const Color(0xFFEF4444);
        label = '🔴 Full (>30m)';
        break;
      default:
        dot = const Color(0xFF10B981);
        label = '🟢 Available';
    }

    return Container(
      width: 170,
      margin: const EdgeInsets.only(right: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFF1F5F9)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            top: 0,
            bottom: 55,
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFE2E8F0),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Center(child: Icon(Icons.image, color: Color(0xFF94A3B8))),
            ),
          ),
          Positioned(
            top: 10,
            right: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.95),
                borderRadius: BorderRadius.circular(12),
                boxShadow: const [BoxShadow(blurRadius: 6, color: Colors.black12)],
              ),
              child: Row(
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text(status, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w900))),
                const Icon(Icons.more_vert, color: Color(0xFFCBD5E1)),
              ],
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 30,
            child: Text(label,
                style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w700)),
          )
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF1F5F9)),
      ),
      child: child,
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: primary)),
    );
  }
}

class _TodoRow extends StatelessWidget {
  const _TodoRow({required this.item, required this.onToggle, required this.onEdit, required this.onDelete});

  final TodoItem item;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final dt = item.date != null ? '${item.date}${item.time != null ? ' ${item.time}' : ''}' : '날짜 미정';

    return Opacity(
      opacity: item.done ? 0.55 : 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            InkWell(
              onTap: onToggle,
              child: Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFCBD5E1), width: 2),
                  color: item.done ? Theme.of(context).colorScheme.primary : Colors.transparent,
                ),
                child: item.done ? const Text('✓', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)) : null,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(dt, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ]),
            ),
            TextButton(onPressed: onEdit, child: const Text('편집')),
            TextButton(onPressed: onDelete, child: const Text('삭제')),
          ],
        ),
      ),
    );
  }
}

class _FavRow extends StatelessWidget {
  const _FavRow({required this.item, required this.onEdit, required this.onDelete});

  final FavoriteItem item;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final when = (item.date != null || item.time != null)
        ? '${item.date ?? '날짜 미정'}${item.time != null ? ' ${item.time}' : ''}'
        : '날짜/시간 미정';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          _Badge(text: item.cat),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.title, style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 2),
              Text('예약/방문: $when', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            ]),
          ),
          TextButton(onPressed: onEdit, child: const Text('편집')),
          TextButton(onPressed: onDelete, child: const Text('삭제')),
        ],
      ),
    );
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({required this.item, required this.onToggle, required this.onEdit, required this.onDelete});

  final ScheduleItem item;
  final VoidCallback onToggle;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  bool _isPast(String? hhmm) {
    if (hhmm == null || hhmm.isEmpty) return false;
    return hhmm.compareTo(AppState.nowHm()) < 0;
  }

  @override
  Widget build(BuildContext context) {
    final past = _isPast(item.time) && !item.done;
    final opacity = item.done ? 0.55 : (past ? 0.6 : 1.0);

    return Opacity(
      opacity: opacity,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            InkWell(
              onTap: onToggle,
              child: Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFCBD5E1), width: 2),
                  color: item.done ? Theme.of(context).colorScheme.primary : Colors.transparent,
                ),
                child: item.done ? const Text('✓', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)) : null,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item.title, style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(item.time ?? '시간 미정', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ]),
            ),
            TextButton(onPressed: onEdit, child: const Text('편집')),
            TextButton(onPressed: onDelete, child: const Text('삭제')),
          ],
        ),
      ),
    );
  }
}

/// =======================
/// Modal helpers
/// =======================
void _showBottomSheet(
  BuildContext context, {
  required String title,
  required Widget body,
  required bool showAdd,
  VoidCallback? onAdd,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              child: Row(
                children: [
                  IconButton(onPressed: () => Navigator.pop(ctx), icon: const Icon(Icons.close)),
                  Expanded(
                    child: Center(
                      child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                    ),
                  ),
                  SizedBox(
                    width: 48,
                    child: showAdd
                        ? IconButton(onPressed: onAdd, icon: const Icon(Icons.add))
                        : const SizedBox.shrink(),
                  )
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: body,
              ),
            ),
          ],
        ),
      );
    },
  );
}

void _showFormDialog(
  BuildContext context, {
  required String title,
  required Widget content,
  required VoidCallback onOk,
}) {
  showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: content,
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('취소')),
        FilledButton(onPressed: onOk, child: const Text('저장')),
      ],
    ),
  );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: Icon(icon),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      onTap: () => Navigator.pop(context),
    );
  }
}
