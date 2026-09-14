import { INTERACTION_POPUP_ARM_DELAY_MS } from "./overlayUtils.js";

export function renderDialog(panel, data = {}) {
  if (!(panel instanceof HTMLElement)) return;
  const speakerName = String(data.speakerName || "Someone");
  const text = String(data.text || "...");
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const sessionId = Number(data.sessionId || 0) | 0;

  panel.innerHTML = "";
  Object.assign(panel.style, {
    minWidth: "min(92vw, 420px)",
    maxWidth: "min(92vw, 420px)",
  });

  const title = document.createElement("div");
  title.textContent = speakerName;
  Object.assign(title.style, {
    fontSize: "18px",
    fontWeight: "700",
    color: "#f3e6b3",
    marginBottom: "10px",
  });
  panel.appendChild(title);

  const body = document.createElement("div");
  body.textContent = text;
  Object.assign(body.style, {
    fontSize: "15px",
    lineHeight: "1.45",
    color: "#e8edf5",
    whiteSpace: "pre-wrap",
    marginBottom: "14px",
  });
  panel.appendChild(body);

  const choiceList = document.createElement("div");
  Object.assign(choiceList.style, {
    display: "grid",
    gap: "10px",
  });
  const armAt = performance.now() + INTERACTION_POPUP_ARM_DELAY_MS;

  const dialogChoices = choices.length > 0 ? choices : [{ id: "close", label: "Goodbye." }];
  for (const [choiceIndex, choice] of dialogChoices.entries()) {
    const btn = document.createElement("button");
    const isDefaultChoice = choiceIndex === 0;
    btn.textContent = String(choice?.label || choice?.id || "Continue");
    Object.assign(btn.style, {
      minHeight: "48px",
      width: "100%",
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(20,28,38,0.92)",
      color: "#f6f7fb",
      textAlign: "left",
      font: "inherit",
      cursor: "pointer",
      touchAction: "manipulation",
    });
    if (isDefaultChoice) {
      Object.assign(btn.style, {
        background: "rgba(43,60,78,0.96)",
        outline: "2px solid rgba(140,164,188,0.85)",
        outlineOffset: "1px",
        boxShadow: "0 0 12px rgba(140,164,188,0.22)",
        fontWeight: "700",
      });
    }
    btn.disabled = true;
    btn.style.opacity = "0.62";
    btn.style.cursor = "default";
    setTimeout(() => {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }, INTERACTION_POPUP_ARM_DELAY_MS);
    btn.addEventListener("click", () => {
      if (performance.now() < armAt) return;
      window.dispatchEvent(new CustomEvent("ui:requestDialogChoice", {
        detail: { sessionId, choiceId: String(choice?.id || "") },
      }));
    });
    choiceList.appendChild(btn);
  }
  panel.appendChild(choiceList);

  const footer = document.createElement("div");
  Object.assign(footer.style, {
    marginTop: "12px",
    display: "flex",
    justifyContent: "flex-end",
  });
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Leave";
  Object.assign(closeBtn.style, {
    minHeight: "42px",
    padding: "8px 14px",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.16)",
    background: "transparent",
    color: "#b6c4d6",
    font: "inherit",
    cursor: "pointer",
    touchAction: "manipulation",
  });
  closeBtn.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("ui:requestDialogClose", {
      detail: { sessionId },
    }));
  });
  footer.appendChild(closeBtn);
  panel.appendChild(footer);
}
