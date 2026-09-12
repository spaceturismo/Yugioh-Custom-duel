(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelLobby = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createLobbyController(client, render) {
        const state = { status: "idle", roomId: null, playerId: null, error: null };

        function update(next) {
            Object.assign(state, next);
            render({ ...state });
        }

        client.onMessage((message) => {
            if (message.type === "joined") {
                update({ status: "joined", roomId: message.roomId, playerId: message.playerId, error: null });
            } else if (message.type === "room_state") {
                update({ status: message.state.phase, error: null });
            } else if (message.type === "error") {
                update({ status: "error", error: message.message });
            }
        });

        return {
            createRoom() {
                update({ status: "joining", error: null });
                client.createRoom();
            },
            joinRoom(roomId) {
                const normalizedRoomId = String(roomId).trim().toUpperCase();
                if (!normalizedRoomId) {
                    update({ status: "error", error: "Enter a room code." });
                    return;
                }
                update({ status: "joining", error: null });
                client.joinRoom(normalizedRoomId);
            }
        };
    }

    return { createLobbyController };
});