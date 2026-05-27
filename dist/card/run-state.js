export const initialState = {
    blocks: [],
    reasoning: { content: '', active: false },
    footer: 'thinking',
    terminal: 'running',
};
function closeStreamingText(blocks) {
    return blocks.map(b => b.kind === 'text' && b.streaming ? { ...b, streaming: false } : b);
}
export function reduce(state, evt) {
    switch (evt.type) {
        case 'text': {
            const last = state.blocks[state.blocks.length - 1];
            if (last && last.kind === 'text' && last.streaming) {
                const next = { ...last, content: last.content + evt.delta };
                return {
                    ...state,
                    blocks: [...state.blocks.slice(0, -1), next],
                    reasoning: { ...state.reasoning, active: false },
                    footer: 'streaming',
                };
            }
            return {
                ...state,
                blocks: [...state.blocks, { kind: 'text', content: evt.delta, streaming: true }],
                reasoning: { ...state.reasoning, active: false },
                footer: 'streaming',
            };
        }
        case 'thinking': {
            return {
                ...state,
                reasoning: { content: state.reasoning.content + evt.delta, active: true },
                footer: 'thinking',
            };
        }
        case 'tool_use': {
            const tool = {
                id: evt.id,
                name: evt.name,
                input: evt.input,
                status: 'running',
            };
            return {
                ...state,
                blocks: [...closeStreamingText(state.blocks), { kind: 'tool', tool }],
                reasoning: { ...state.reasoning, active: false },
                footer: 'tool_running',
            };
        }
        case 'tool_result': {
            const blocks = state.blocks.map(b => {
                if (b.kind !== 'tool' || b.tool.id !== evt.id)
                    return b;
                return {
                    ...b,
                    tool: {
                        ...b.tool,
                        status: evt.isError ? 'error' : 'done',
                        output: evt.output,
                    },
                };
            });
            return { ...state, blocks };
        }
        case 'error':
            return { ...state, terminal: 'error', errorMsg: evt.message, footer: null };
        case 'done':
            return {
                ...state,
                blocks: closeStreamingText(state.blocks),
                reasoning: { ...state.reasoning, active: false },
                terminal: 'done',
                footer: null,
            };
        default:
            return state;
    }
}
export function markInterrupted(state) {
    return {
        ...state,
        blocks: closeStreamingText(state.blocks),
        reasoning: { ...state.reasoning, active: false },
        terminal: 'interrupted',
        footer: null,
    };
}
export function markIdleTimeout(state, minutes) {
    return {
        ...state,
        blocks: closeStreamingText(state.blocks),
        reasoning: { ...state.reasoning, active: false },
        terminal: 'idle_timeout',
        footer: null,
        idleTimeoutMinutes: minutes,
    };
}
export function finalizeIfRunning(state) {
    if (state.terminal !== 'running')
        return state;
    return {
        ...state,
        blocks: closeStreamingText(state.blocks),
        reasoning: { ...state.reasoning, active: false },
        terminal: 'done',
        footer: null,
    };
}
