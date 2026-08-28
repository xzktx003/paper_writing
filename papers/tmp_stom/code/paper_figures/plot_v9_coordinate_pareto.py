"""Generate the V9 coordinate Pareto and hard-projection diagnostic figure."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PDF = ROOT / "img" / "v9_coordinate_pareto.pdf"
OUTPUT_PNG = ROOT / "img" / "v9_coordinate_pareto.png"


def main() -> None:
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 9,
            "axes.labelsize": 9,
            "axes.titlesize": 10,
            "legend.fontsize": 7.5,
            "pdf.fonttype": 42,
            "ps.fonttype": 42,
        }
    )

    fig, (ax_pareto, ax_hard) = plt.subplots(1, 2, figsize=(7.15, 2.75))

    endpoints = {
        "QTIP (general PTQ)": (8.7971146626, 69.84693128, False, "D"),
        "Vector-GSQ anchor": (10.4959764481, 67.99970386, False, "o"),
        "Assignment-only": (10.7346715927, 69.47737347, True, "o"),
        "Scale-only": (10.9447565079, 71.72225110, True, "o"),
        "Naive joint": (11.4097919464, 69.74338550, True, "X"),
        "Teacher/text-only": (12.2603511810, 65.92170201, False, "s"),
    }
    colors = {
        "QTIP (general PTQ)": "#3B6FB6",
        "Vector-GSQ anchor": "#646464",
        "Assignment-only": "#E08B24",
        "Scale-only": "#2C8C6B",
        "Naive joint": "#C9485B",
        "Teacher/text-only": "#8A67AB",
    }
    offsets = {
        "QTIP (general PTQ)": (5, 6),
        "Vector-GSQ anchor": (5, -13),
        "Assignment-only": (-52, 7),
        "Scale-only": (-24, 7),
        "Naive joint": (5, 6),
        "Teacher/text-only": (-62, 7),
    }

    for name, (ppl, macro, task_supervised, marker) in endpoints.items():
        ax_pareto.scatter(
            ppl,
            macro,
            s=58,
            marker=marker,
            color=colors[name],
            edgecolor="white",
            linewidth=0.7,
            zorder=3,
        )
        ax_pareto.annotate(
            name,
            (ppl, macro),
            xytext=offsets[name],
            textcoords="offset points",
            color=colors[name],
            fontsize=7.2,
        )
        if task_supervised:
            ax_pareto.scatter(
                ppl,
                macro,
                s=90,
                facecolors="none",
                edgecolors=colors[name],
                linewidth=0.8,
                zorder=2,
            )

    ax_pareto.plot(
        [endpoints["QTIP (general PTQ)"][0], endpoints["Scale-only"][0]],
        [endpoints["QTIP (general PTQ)"][1], endpoints["Scale-only"][1]],
        color="#9A9A9A",
        linestyle="--",
        linewidth=1.0,
        zorder=1,
        label="observed quality frontier",
    )
    ax_pareto.set_xlabel("WikiText2 perplexity (lower is better)")
    ax_pareto.set_ylabel("6-task macro accuracy (%)")
    ax_pareto.set_title("(a) Same-model deployment endpoints")
    ax_pareto.grid(True, color="#E7E7E7", linewidth=0.7)
    ax_pareto.set_axisbelow(True)
    ax_pareto.legend(loc="lower left", frameon=False)

    labels = [
        "Anchor",
        "Joint\nscale-only",
        "Joint\nhard",
        "Assignment\nindependent",
        "Scale\nindependent",
    ]
    values = [71.953125, 70.9375, 72.8125, 74.140625, 76.328125]
    bar_colors = ["#646464", "#C9485B", "#C9485B", "#E08B24", "#2C8C6B"]
    bars = ax_hard.bar(range(len(labels)), values, color=bar_colors, width=0.68)
    ax_hard.axhline(values[0], color="#646464", linestyle="--", linewidth=0.9)
    ax_hard.set_ylim(69.5, 77.1)
    ax_hard.set_ylabel("Validation macro accuracy (%)")
    ax_hard.set_xticks(range(len(labels)), labels, rotation=0, ha="center", fontsize=7.0)
    ax_hard.set_title("(b) Soft joint training harms hard states")
    ax_hard.grid(axis="y", color="#E7E7E7", linewidth=0.7)
    ax_hard.set_axisbelow(True)
    for bar, value in zip(bars, values):
        ax_hard.text(
            bar.get_x() + bar.get_width() / 2,
            value + 0.12,
            f"{value:.2f}",
            ha="center",
            va="bottom",
            fontsize=7.2,
        )

    fig.tight_layout(w_pad=1.7)
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT_PDF, bbox_inches="tight")
    fig.savefig(OUTPUT_PNG, dpi=240, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
