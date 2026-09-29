"""Read-only Slack conversation evidence. A thread is not a guessed task tree."""
import collections
import re
import time
import json
from operations import board_read
from reporting import attachment_path, enrich_report


def conversation_state(tasks):
    if not tasks:
        return 'conversation'
    if any(t['status'] in ('blocked', 'triage') for t in tasks):
        return 'attention'
    if any(t['status'] in ('running', 'in_progress', 'claimed') for t in tasks):
        return 'working'
    if all(t['status'] == 'done' for t in tasks):
        return 'recorded_done'
    if all(t['status'] in ('done', 'archived') for t in tasks):
        return 'closed_mixed'
    return 'waiting'


def assemble(tasks, subscriptions, receipts, sessions, routes):
    """Only exact channel/thread keys join tasks; channel-only stays unlinked."""
    groups = {}
    route_map = {r['chat_id']: r for r in routes}
    task_map = {t['id']: t for t in tasks}
    slack_ids = set()
    unlinked = set()
    def group(chat, thread):
        key = (chat, thread)
        if key not in groups:
            route = route_map.get(chat, {})
            groups[key] = dict(id=chat + ':' + thread, chatId=chat, threadId=thread,
                               channel=route.get('name', chat), profile=route.get('profile'),
                               title='원문 확인 필요', user=None, userId=None, taskIds=[], sessions=[],
                               url=None, originKnown=False, lastAt=0)
        return groups[key]
    for sub in subscriptions:
        if sub.get('platform') != 'slack' or sub['task_id'] not in task_map:
            continue
        slack_ids.add(sub['task_id'])
        if not sub.get('thread_id'):
            unlinked.add(sub['task_id'])
            continue
        g = group(sub['chat_id'], sub['thread_id'])
        if sub['task_id'] not in g['taskIds']:
            g['taskIds'].append(sub['task_id'])
    seen = set()
    for s in sorted(sessions, key=lambda s: s.get('started_at') or 0):
        if s['id'] in seen or not s.get('chat_id') or not s.get('thread_id'):
            continue
        seen.add(s['id'])
        g = group(s['chat_id'], s['thread_id'])
        g['sessions'].append(s['id'])
        if s.get('userText') and not g['originKnown']:
            raw = re.sub(r'^\[[^\]\n]*\| Slack user <@[^>]+>\]\s*', '', s['userText'])
            g.update(title=raw[:110] + ('…' if len(raw)>110 else ''), requestText=raw,
                     user=s.get('user_name'), userId=s.get('user_id'), originKnown=True)
        team = s.get('team')
        if re.fullmatch(r'T[A-Z0-9]+', team or '') and re.fullmatch(r'C[A-Z0-9]+', s['chat_id']) and re.fullmatch(r'\d+\.\d+', s['thread_id']):
            g['url'] = f"https://app.slack.com/client/{team}/{s['chat_id']}/thread/{s['chat_id']}-{s['thread_id']}"
        g['lastAt'] = max(g['lastAt'], s.get('lastAt') or s.get('started_at') or 0)
    received = {(r['task_id'], r['chat_id'], r['thread_id'], r['event_id']): r['sent_at'] for r in receipts if r.get('platform') == 'slack'}
    for g in groups.values():
        items = [dict(task_map[t]) for t in g['taskIds']]
        for t in items:
            matches = [at for (tid, chat, thread, event), at in received.items() if tid == t['id'] and chat == g['chatId'] and thread == g['threadId']]
            t['lastReceiptAt'] = max(matches, default=None)
            # A start/progress receipt must never count as completion delivery.
            latest_completion = max(t.get('completionEventIds', []), default=None)
            t['completionDelivered'] = latest_completion is not None and (t['id'], g['chatId'], g['threadId'], latest_completion) in received
            g['lastAt'] = max(g['lastAt'], t.get('lastProgressAt') or t.get('created_at') or 0)
        g['tasks'] = sorted(items, key=lambda t: t.get('created_at') or 0)
        g['state'] = conversation_state(items)
        g['done'] = sum(t['status'] == 'done' for t in items)
        g['reportedDone'] = sum(t['status'] == 'done' and t['completionDelivered'] for t in items)
        g['lastReceiptAt'] = max((t['lastReceiptAt'] or 0 for t in items), default=0)
        g['needs'] = [t['reason'] for t in items if t.get('reason')]
        # Exact workspace sharing by concurrent runs is evidence of a conflict risk,
        # not proof that similarly named work is a duplicate.
        paths = collections.defaultdict(list)
        for t in items:
            if t['status'] in ('running', 'in_progress', 'claimed') and t.get('workspace_path'):
                paths[t['workspace_path']].append(t['id'])
        g['overlap'] = [v for v in paths.values() if len(v) > 1]
    return dict(conversations=sorted(groups.values(), key=lambda g: g['lastAt'], reverse=True),
                unlinked=[task_map[t] for t in unlinked], slackTaskCount=len(slack_ids))


def read_slack(home, operations, routes, redact):
    errors = []
    sessions = []
    db_paths = [home / 'state.db', *sorted((home / 'profiles').glob('*/state.db'))]
    for path in db_paths:
        if not path.exists():
            continue
        try:
            with board_read(path) as c:
                cols = {r['name'] for r in c.execute('pragma table_info(sessions)')}
                if not {'source', 'chat_id', 'thread_id', 'origin_json'} <= cols:
                    continue
                for row in c.execute("select id,chat_id,thread_id,origin_json,started_at from sessions where source='slack' and thread_id is not null order by started_at desc limit 100"):
                    s = dict(row)
                    try:
                        origin = json.loads(s.pop('origin_json') or '{}')
                    except ValueError:
                        origin = {}
                    s['team'] = origin.get('scope_id') or origin.get('guild_id')
                    s['user_name'] = redact(origin.get('user_name') or '')
                    s['user_id'] = origin.get('user_id') if re.fullmatch(r'[UW][A-Z0-9]+', origin.get('user_id') or '') else None
                    # Automatic Kanban wake messages masquerade as user-role messages.
                    # Only a recorded non-system first message can title a conversation.
                    msg = c.execute("select content,timestamp from messages where session_id=? and role='user' order by id limit 1", (s['id'],)).fetchone()
                    if msg and isinstance(msg['content'], str) and not msg['content'].lstrip().startswith(('[kanban]', '[cron]', '[System')):
                        s['userText'] = redact(msg['content'])[:700]
                    s['lastAt'] = c.execute('select max(timestamp) from messages where session_id=?', (s['id'],)).fetchone()[0] or s['started_at']
                    sessions.append(s)
        except Exception as exc:
            errors.append(path.parent.name + ': ' + redact(str(exc))[:120])
    tasks = [dict(t) for t in operations['tasks']]
    with board_read(home / 'kanban.db') as c:
        subscriptions = [dict(r) for r in c.execute("select task_id,platform,chat_id,thread_id,notifier_profile from kanban_notify_subs where platform='slack'")]
        receipts = [dict(r) for r in c.execute("select * from kanban_notify_receipts where platform='slack'")]
        completed = collections.defaultdict(list)
        for r in c.execute("select id,task_id from task_events where kind='completed'"):
            completed[r['task_id']].append(r['id'])
        paths = {r['id']: dict(r) for r in c.execute('select id,workspace_path,project_id from tasks')}
        attachments = collections.defaultdict(list)
        for row in c.execute('select id,task_id,filename,stored_path,size,created_at from task_attachments'):
            a = dict(row)
            a['available'] = attachment_path(home, a['stored_path']) is not None
            a.pop('stored_path')
            a['filename'] = redact(a['filename'])
            attachments[a.pop('task_id')].append(a)
        for t in tasks:
            t['completionEventIds'] = completed[t['id']]
            t.update(paths.get(t['id'], {}))
            t['attachments'] = attachments[t['id']]
    result = assemble(tasks, subscriptions, receipts, sessions, routes)
    enrich_report(result, home, routes)
    result.update(checked=time.time(), errors=errors, activation=operations.get('activation'), liveAgents=operations.get('liveAgents', []))
    return result
