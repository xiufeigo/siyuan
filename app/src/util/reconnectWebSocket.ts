import {getAllEditor, getAllModels} from "../layout/getAll";

type Reconnectable = {reconnectIfNeeded?: () => void};

let foregroundReconnectInstalled = false;

const visit = (model?: Reconnectable) => {
    if (!model?.reconnectIfNeeded) {
        return;
    }
    try {
        model.reconnectIfNeeded();
    } catch (error) {
        console.warn("reconnectWebSocket: skipped", error);
    }
};

// 原生壳 onForeground 会调用 window.reconnectWebSocket。已打开的套接字 ping 保活，已关闭的立即重连。
export const reconnectKernelWebSockets = () => {
    if (!window.siyuan) {
        return;
    }
    try {
        visit(window.siyuan.ws);
        visit(window.siyuan.mobile?.docks?.file);
        getAllEditor().forEach((editor) => visit(editor?.protyle?.ws));
        Object.values(getAllModels()).forEach((models) => {
            models.forEach(visit);
        });
    } catch (error) {
        console.warn("reconnectWebSocket: skipped", error);
    }
};

export const installKernelReconnectOnForeground = () => {
    window.reconnectWebSocket = reconnectKernelWebSockets;
    if (foregroundReconnectInstalled) {
        return;
    }
    foregroundReconnectInstalled = true;
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            reconnectKernelWebSockets();
        }
    });
};
