import {
  peerUserIdForParticipant,
  pickCanonicalConversation,
} from "../src/modules/chat/chat-conversation-participants";

describe("chat-conversation-participants", () => {
  it("resolves peer for candidate-side participant", () => {
    expect(
      peerUserIdForParticipant(
        { viewerUserId: "u7", candidateUserId: "u6" },
        "u6",
      ),
    ).toBe("u7");
  });

  it("prefers conversation with more messages", () => {
    const picked = pickCanonicalConversation([
      {
        id: "a",
        viewerUserId: "u7",
        candidateUserId: "u6",
        _count: { messages: 1 },
      },
      {
        id: "b",
        viewerUserId: "u6",
        candidateUserId: "u7",
        _count: { messages: 5 },
      },
    ]);
    expect(picked?.id).toBe("b");
  });
});
