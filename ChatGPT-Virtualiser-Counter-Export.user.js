// ==UserScript==
// @name         ChatGPT Virtualiser + Counter + Export 
// @namespace    https://github.com/vasilywarmare
// @version      1.0
// @description  HUD: Virtualiser toggle (line 1), Counter + Export (line 2).
// @author       WarmarE
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        none
//
// @homepageURL  https://github.com/vasilywarmare/ChatGPT-Virtualiser-Counter-Export
// @supportURL   https://github.com/vasilywarmare/ChatGPT-Virtualiser-Counter-Export/issues
//
// @updateURL    https://raw.githubusercontent.com/vasilywarmare/ChatGPT-Virtualiser-Counter-Export/main/ChatGPT-Virtualiser-Counter-Export.user.js
// @downloadURL  https://raw.githubusercontent.com/vasilywarmare/ChatGPT-Virtualiser-Counter-Export/main/ChatGPT-Virtualiser-Counter-Export.user.js
// ==/UserScript==

"use strict";

/// <summary>
/// Global state bag: configurable thresholds, HUD elements, toggles, timers.
/// </summary>
const State =
{
    maxChars: 150000,         // Hard stop (ChatGPT greys out the send button above this).
    cautionThreshold: 142500, // Early warning (turns gold when above this).
    panelElement: null,       // Root HUD container <div>.
    counterElement: null,     // Text span showing the character count.
    virtualiserEnabled: true, // Whether virtualisation is currently active.

    visibilityBuffer:         // Viewport buffer multipliers for virtualiser.
    {
        top: 1.0,             // Allow ~1 viewport height above screen to stay rendered.
        bottom: 1.0           // Allow ~1 viewport height below screen to stay rendered.
    },

    timers:
    {
        counter: null,        // Periodic counter refresh interval handle.
        virtualiser: null     // Periodic virtualiser refresh interval handle.
    }
};

main();

/// <summary>
/// Program entry: build HUD, bind events, start loops, do first updates.
/// </summary>
function main()
{
    CreatePanel(State);
    BindGlobalEvents(State);
    StartLoops(State);
    UpdateCounter(State);
    Virtualise(State);
}

/// <summary>
/// Creates (or reuses) the floating HUD.
///
/// Layout:
///  - Line 1: Virtualiser toggle (text + status colour).
///  - Line 2: Counter (char length) + Export button.
///
/// Notes:
///  - Will early-return if HUD already exists and is connected.
///  - All CSS applied inline for self-contained userscript.
/// </summary>
function CreatePanel(state)
{
    // Do not duplicate HUD if it already exists in DOM.
    if (state.panelElement && state.panelElement.isConnected) return;

    // Root HUD container.
    const container = document.createElement("div");

    // Apply HUD styling
    ApplyHudStyle(container);

    // --- Line 1: Virtualiser toggle ---
    const toggleRow = document.createElement("div");
    toggleRow.style.cursor = "pointer";

    const label = document.createElement("span");
    label.textContent = "Virtualiser: ";

    const status = document.createElement("span");
    status.textContent = state.virtualiserEnabled ? "On" : "Off";
    status.style.color = state.virtualiserEnabled ? "lime" : "red";

    toggleRow.appendChild(label);
    toggleRow.appendChild(status);

    // Toggle behaviour on click.
    toggleRow.onclick = () =>
    {
        state.virtualiserEnabled = !state.virtualiserEnabled;

        status.textContent = state.virtualiserEnabled ? "On" : "Off";
        status.style.color = state.virtualiserEnabled ? "lime" : "red";

        if (!state.virtualiserEnabled)
        {
            RestoreAll(state); // Ensure all messages restored when turning off.
        }
    };

    // --- Line 2: Counter + Export ---
    const secondRow = document.createElement("div");
    secondRow.style.display = "flex";
    secondRow.style.alignItems = "center";
    secondRow.style.gap = "8px";
    secondRow.style.justifyContent = "space-between"; 

    const counter = document.createElement("span");
    counter.textContent = `Est: 0 / ${state.maxChars}`;

    const exportButton = document.createElement("button");
    exportButton.textContent = "Export";
    ApplyButtonStyle(exportButton);
    exportButton.onclick = () => ExportSafe(state);

    secondRow.appendChild(counter);
    secondRow.appendChild(exportButton);

    // Assemble HUD.
    container.appendChild(toggleRow);
    container.appendChild(secondRow);
    document.body.appendChild(container);

    // Save references in state for re-use.
    state.panelElement = container;
    state.counterElement = counter;
}


/// <summary>
/// Updates the counter element based on active input length.
///
/// Colours:
///  - red if above maxChars
///  - gold if above cautionThreshold
///  - normal otherwise
/// </summary>
function UpdateCounter(state)
{
    // Always ensure the HUD exists (safe re-create if DOM was reset).
    CreatePanel(state);

    const length = GetActiveInputText().length;

    state.counterElement.textContent = `Est: ${length} / ${state.maxChars}`; 
    state.counterElement.style.color = ChooseCounterColour(length, state);
}

/// <summary>
/// Returns the colour for the counter text based on thresholds.
/// </summary>
function ChooseCounterColour(length, state)
{
    if (length > state.maxChars)
    {
        return "red"; // Above hard limit.
    }

    if (length > state.cautionThreshold)
    {
        return "gold"; // Approaching hard limit.
    }

    return "var(--text-primary, #ccc)"; // Default (normal) colour.
}

/// <summary>
/// Reads current text from focused text area or content editable element.
/// </summary>
function GetActiveInputText()
{
    const element = document.activeElement;

    if (!element)
    {
        return "";
    }

    if (element.tagName === "TEXTAREA")
    {
        return element.value || "";
    }

    if (element.getAttribute && element.getAttribute("contenteditable") === "true")
    {
        return element.innerText || "";
    }

    return "";
}

/// <summary>
/// Exports all chat messages into a downloadable .txt file named after the current thread.
/// </summary>
function ExportChat(state)
{
    let threadTitle =
        document.querySelector("nav [aria-current='page'] span")?.textContent
        || document.querySelector("header h1")?.textContent
        || document.title
        || "chat";

    threadTitle = (threadTitle || "chat").replace(/[\\/:*?"<>|]/g, "");

    if (!threadTitle)
    {
        threadTitle = "chat";
    }

    const messageNodes = document.querySelectorAll("[data-message-author-role], .markdown, .prose");
    const lines = [];

    for (const node of messageNodes)
    {
        const text = (node.innerText || "").trim();

        if (text)
        {
            lines.push(text);
        }
    }

    const exportPayload = lines.join("\n\n---\n\n");
    const textBlob = new Blob([exportPayload], { type: "text/plain" });

    const downloadLink = document.createElement("a");

    downloadLink.href = URL.createObjectURL(textBlob);
    downloadLink.download = `${threadTitle}.txt`;
    downloadLink.click();
}

/// <summary>
/// Ensures full message visibility before exporting chat.
/// </summary>
function ExportSafe(state)
{
    RestoreAll(state);
    setTimeout(() => ExportChat(state), 100); // wait to ensure DOM restored
}

/// <summary>
/// Hides off‑screen messages and replaces them with a lightweight placeholder; restores when visible.
/// Also re-triggers syntax highlighting after restore (Prism/hljs if present).
/// </summary>
function Virtualise(state)
{
    if (!state.virtualiserEnabled) return;

    const container = document.querySelector("main") || document.querySelector("div[role='main']");

    if (!container) return;

    const viewportHeight = window.innerHeight;
    const messages = container.querySelectorAll("[data-message-author-role]");

    for (const m of messages)
    {
        const rect = m.getBoundingClientRect(); // bounding box of message block relative to viewport
        const visible = IsMessageVisible(rect, viewportHeight);

        if (!visible && !m.dataset.virtualised)
        {
            m.dataset.virtualised = "1";
            m.originalHtml = m.innerHTML;

            const placeholder = document.createElement("div");
            ApplyPlaceholderStyle(placeholder);

            m.innerHTML = "";
            m.appendChild(placeholder);
        }
        else if (visible && m.dataset.virtualised)
        {
            m.dataset.virtualised = "";
            m.innerHTML = m.originalHtml;

            RehighlightSoon();
        }
    }
}

/// <summary>
/// Restores every previously hidden message; then re-run highlighters.
/// </summary>
function RestoreAll(state)
{
    const all = document.querySelectorAll("[data-message-author-role]");

    for (const m of all)
    {
        if (m.dataset.virtualised)
        {
            m.dataset.virtualised = "";
            m.innerHTML = m.originalHtml;
        }
    }
    
    RehighlightSoon();
}

/// <summary>
/// Attempts to re-run Prism / Highlight.js after DOM restore (immediate + RAF + short timeout).
/// </summary>
function RehighlightSoon()
{
    const run = () =>
    {
        if (window.Prism?.highlightAll)
        {
            window.Prism.highlightAll();
        }

        if (window.hljs?.highlightAll)
        {
            window.hljs.highlightAll();
        }
    };

    run();
    requestAnimationFrame(run);
    setTimeout(run, 80);
}

/// <summary>
/// Binds global listeners for counter updates and virtualiser refresh.
/// </summary>
function BindGlobalEvents(state)
{
    document.addEventListener("input", () => UpdateCounter(state), true);
    document.addEventListener("keyup", () => UpdateCounter(state), true);

    window.addEventListener("resize", () => Virtualise(state), { passive: true });
    window.addEventListener("scroll", () => Virtualise(state), { passive: true });
}

/// <summary>
/// Starts periodic, low-frequency fallbacks (counter ~0.5s; virtualiser ~1s).
/// </summary>
function StartLoops(state)
{
    state.timers.counter = setInterval(() => UpdateCounter(state), 500);
    state.timers.virtualiser = setInterval(() => Virtualise(state), 1000);
}

/// <summary>
/// Applies consistent HUD panel styling to the container element.
///
/// Purpose:
///  - Fixed floating panel (bottom-right corner).
///  - Compact, semi-transparent look.
///  - Responsive width, readable at all times.
///
/// Notes:
///  - Right-aligned with margin, fixed at bottom.
///  - Uses CSS variables with fallbacks for theme compatibility.
///  - MinWidth ensures counter text does not wrap unexpectedly.
/// </summary>
function ApplyHudStyle(container)
{
    container.style.position = "fixed";                         // HUD always floats on screen.
    container.style.right = "24px";                             // Margin from right edge.
    container.style.bottom = "20px";                            // Margin from bottom edge.
    container.style.fontSize = "12px";                          // Base font size for HUD text.
    container.style.zIndex = "9999";                            // Ensure HUD is above chat elements.
    container.style.display = "flex";                           // Flex layout (column direction).
    container.style.flexDirection = "column";                   // Stack rows vertically.
    container.style.gap = "4px";                                // Small vertical gap between rows.
    container.style.background = "rgba(0,0,0,0.25)";          // Semi-transparent dark background.
    container.style.padding = "6px 8px";                        // Internal padding for breathing room.
    container.style.borderRadius = "6px";                       // Rounded corners.
    container.style.border = "1px solid var(--border, #444)"; // Subtle outline (theme aware).
    container.style.minWidth = "160px";                         // Prevent text wrapping in counter.
}

/// <summary>
/// Applies consistent HUD styling to a button element.
///
/// Purpose:
///  - Small, unobtrusive look (fits inside HUD panel).
///  - Neutral dark theme to match ChatGPT UI.
///  - Visual consistency across Export / future buttons.
///
/// Notes:
///  - Styling is inline (self-contained for userscript).
///  - Uses CSS variables with fallbacks for better theme compatibility.
/// </summary>
function ApplyButtonStyle(button)
{
    button.style.fontSize = "11px";                          // Slightly smaller than counter text.
    button.style.padding = "2px 6px";                        // Compact padding (top/bottom, left/right).
    button.style.borderRadius = "6px";                       // Rounded corners, consistent with HUD.
    button.style.border = "1px solid var(--border, #444)"; // Subtle outline (follows theme).
    button.style.background = "var(--bg, #222)";           // Dark background (fallback #222).
    button.style.color = "inherit";                          // Inherit text colour (keeps theme contrast).
    button.style.cursor = "pointer";                         // Hand cursor for clarity.
}

/// <summary>
/// Applies consistent styling to a placeholder element used in Virtualiser.
/// 
/// Purpose:
///  - Clearly indicate that a message is hidden.
///  - Lightweight, low-contrast (so it doesn't distract).
///  - Fits visually with the rest of the HUD styling.
/// 
/// Notes:
///  - Placeholder is always centred.
///  - Semi-transparent to look less important.
/// </summary>
function ApplyPlaceholderStyle(placeholder)
{
    placeholder.style.textAlign = "center";       // Centre align placeholder text.
    placeholder.style.opacity = "0.5";            // Semi-transparent (not dominant).
    placeholder.style.fontSize = "12px";          // Match HUD font size for consistency.
    placeholder.textContent = "[Message hidden]"; // Default message.
}

/// <summary>
/// Determines whether a message element is considered "visible"
/// within the current viewport, using configurable top/bottom buffers.
/// 
/// Purpose:
///  - Avoids flicker by not hiding/restoring exactly at viewport edges.
///  - Provides smoother scroll experience (messages stay rendered
///    slightly before/after they are strictly visible).
///
/// Parameters:
///  - rect: DOMRect from element.getBoundingClientRect()
///  - viewportHeight: window.innerHeight at evaluation time
///
/// Buffers:
///  - bufferTop: multiplier for how many viewport-heights above the screen
///               still count as visible (default: 1.0)
///  - bufferBottom: multiplier for how many viewport-heights below the screen
///                  still count as visible (default: 1.0)
///
/// Returns:
///  - true if element is within the extended visibility zone.
///  - false if element is far enough off-screen to virtualise.
/// </summary>
function IsMessageVisible(rect, viewportHeight)
{
    return rect.bottom > -viewportHeight * State.visibilityBuffer.top &&
           rect.top < viewportHeight * (1 + State.visibilityBuffer.bottom);
}




