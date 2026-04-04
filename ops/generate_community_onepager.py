from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path
import textwrap


ROOT = Path("/Users/mikey/Desktop/School/MASTERS OF TEACHING /CMP DOCUMENTS/mmmf-codex")
SITE_ROOT = Path("/Users/mikey/Desktop/Desktop Stuff/decision-lab")
OUT_PDF = ROOT / "docs" / "MMMF_Community_OnePager.pdf"
OUT_PNG = ROOT / "docs" / "MMMF_Community_OnePager_preview.png"

NAVY = "#162847"
NAVY_2 = "#223b66"
NAVY_3 = "#1a2f53"
GOLD = "#c89b3c"
GOLD_2 = "#e5be66"
PAPER = "#f6f0e4"
WHITE = "#ffffff"
INK = "#172033"
MUTED = "#d7dcea"
TEAL = "#63b7b2"
GREEN = "#73c6b6"

PAGE_W = 2550
PAGE_H = 3300
MARGIN = 120
LEFT_W = 760
GAP = 34
RIGHT_X = MARGIN + LEFT_W + GAP
RIGHT_W = PAGE_W - RIGHT_X - MARGIN


def font(name: str, size: int):
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size=size)


F_SERIF_120 = font("Georgia Bold.ttf", 120)
F_SERIF_74 = font("Georgia Bold.ttf", 74)
F_SERIF_58 = font("Georgia Bold.ttf", 58)
F_SERIF_44 = font("Georgia Bold.ttf", 44)
F_SERIF_36 = font("Georgia Bold.ttf", 36)
F_SANS_28 = font("Arial.ttf", 28)
F_SANS_30 = font("Arial.ttf", 30)
F_SANS_32 = font("Arial.ttf", 32)
F_SANS_34 = font("Arial.ttf", 34)
F_SANS_36 = font("Arial.ttf", 36)
F_SANS_38 = font("Arial Bold.ttf", 38)
F_SANS_42 = font("Arial Bold.ttf", 42)
F_SANS_48 = font("Arial Bold.ttf", 48)
F_SANS_52 = font("Arial Bold.ttf", 52)
F_SANS_60 = font("Arial Bold.ttf", 60)
F_SANS_66 = font("Arial Bold.ttf", 66)
F_SANS_24 = font("Arial.ttf", 24)
F_SANS_26 = font("Arial.ttf", 26)


def wrap(draw, text, font_obj, width):
    words = text.split()
    lines = []
    cur = ""
    for word in words:
        test = word if not cur else f"{cur} {word}"
        if draw.textlength(test, font=font_obj) <= width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def draw_wrapped(draw, text, xy, font_obj, fill, width, line_gap=8):
    x, y = xy
    lines = wrap(draw, text, font_obj, width)
    ascent, descent = font_obj.getmetrics()
    line_h = ascent + descent + line_gap
    for line in lines:
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += line_h
    return y


def circle_headshot(path: Path, size: int, border=8):
    im = Image.open(path).convert("RGB")
    im = ImageOps.fit(im, (size - border * 2, size - border * 2), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", (size - border * 2, size - border * 2), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - border * 2 - 1, size - border * 2 - 1), fill=255)
    circ = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ring = ImageDraw.Draw(circ)
    ring.ellipse((0, 0, size - 1, size - 1), fill=GOLD)
    circ.paste(im, (border, border), mask)
    return circ


def draw_stat(draw, x, y, label, value):
    w = 180
    h = 126
    draw.rounded_rectangle((x, y, x + w, y + h), radius=18, fill=NAVY_2)
    draw.text((x + 16, y + 14), label, font=F_SANS_24, fill=GOLD_2)
    value_font = F_SANS_38
    if len(value) > 12:
        value_font = F_SANS_30
    elif len(value) > 9:
        value_font = F_SANS_34
    max_width = w - 28
    value_lines = wrap(draw, value, value_font, max_width)
    vy = y + 52
    for line in value_lines[:2]:
        draw.text((x + 16, vy), line, font=value_font, fill=WHITE)
        vy += value_font.size + 2


def draw_left_snapshot(draw, x, y, width):
    draw.rounded_rectangle((x, y, x + width, y + 242), radius=20, fill=NAVY_2)
    draw.text((x + 24, y + 22), "PROGRAM SNAPSHOT", font=F_SANS_28, fill=GOLD_2)
    lines = [
        "Built for school, family, workplace, and community use.",
        "Designed to teach life skills explicitly, not assume them.",
        "Structured for transfer to real situations, not just coverage.",
        "Flexible enough for pilot, classroom, workshop, or licensing use.",
    ]
    cy = y + 70
    for idx, line in enumerate(lines):
        color = GREEN if idx % 2 == 0 else GOLD_2
        draw.ellipse((x + 24, cy + 10, x + 40, cy + 26), fill=color)
        cy = draw_wrapped(draw, line, (x + 54, cy), F_SANS_28, WHITE, width - 78, line_gap=4) + 10


def draw_tag(draw, x, y, text, fill):
    w = int(draw.textlength(text, font=F_SANS_28)) + 42
    h = 50
    draw.rounded_rectangle((x, y, x + w, y + h), radius=20, fill=fill)
    draw.text((x + 18, y + 10), text, font=F_SANS_28, fill=WHITE)
    return x + w + 12


def draw_bullet_list(draw, x, y, items, width):
    for idx, item in enumerate(items):
        color = [GREEN, GOLD_2, TEAL, GOLD_2, GREEN, GOLD_2][idx % 6]
        draw.ellipse((x, y + 12, x + 20, y + 32), fill=color)
        y = draw_wrapped(draw, item, (x + 34, y), F_SANS_34, WHITE, width - 34, line_gap=6) + 10
    return y


def draw_measure_tags(draw, x, y, items, max_width):
    cx = x
    cy = y
    for item in items:
        w = int(draw.textlength(item, font=F_SANS_28)) + 58
        if cx + w > x + max_width:
            cx = x
            cy += 46
        draw.text((cx, cy), "□", font=F_SANS_28, fill=WHITE)
        draw.text((cx + 26, cy), item, font=F_SANS_28, fill=WHITE)
        cx += w
    return cy


def draw_info_panel(draw, x, y, w, h, title, lines):
    draw.rounded_rectangle((x, y, x + w, y + h), radius=18, fill=NAVY_2)
    draw.text((x + 18, y + 16), title, font=F_SANS_28, fill=GOLD_2)
    cy = y + 56
    for idx, line in enumerate(lines):
        dot = GREEN if idx % 2 == 0 else GOLD_2
        draw.ellipse((x + 18, cy + 10, x + 32, cy + 24), fill=dot)
        cy = draw_wrapped(draw, line, (x + 46, cy), F_SANS_28, WHITE, w - 64, line_gap=4) + 8
    return cy


def main():
    img = Image.new("RGB", (PAGE_W, PAGE_H), PAPER)
    draw = ImageDraw.Draw(img)

    # background blocks
    draw.rectangle((0, 0, PAGE_W, PAGE_H), fill=PAPER)
    draw.rounded_rectangle((MARGIN, MARGIN, MARGIN + LEFT_W, PAGE_H - MARGIN), radius=22, fill=NAVY)
    draw.rectangle((MARGIN + LEFT_W + GAP // 2, MARGIN + 140, MARGIN + LEFT_W + GAP // 2 + 8, PAGE_H - MARGIN - 140), fill=TEAL)
    draw.rounded_rectangle((RIGHT_X, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN), radius=22, fill=NAVY_3)

    # left column top
    draw.text((MARGIN + 44, MARGIN + 48), "MMMF", font=F_SANS_66, fill=GOLD_2)
    draw.text((MARGIN + 44, MARGIN + 124), "REAL-WORLD SKILLS", font=F_SANS_32, fill=GOLD_2)

    title_x = MARGIN + 44
    draw.text((title_x, MARGIN + 220), "Modern", font=F_SERIF_74, fill=WHITE)
    draw.text((title_x, MARGIN + 300), "Manners", font=F_SERIF_74, fill=WHITE)
    draw.text((title_x, MARGIN + 382), "& Mental", font=F_SERIF_74, fill=GOLD_2)
    draw.text((title_x, MARGIN + 464), "Fortitude", font=F_SERIF_74, fill=WHITE)

    stats_y = MARGIN + 630
    stat_gap = 18
    stat_w = 180
    draw_stat(draw, title_x, stats_y, "GRADES", "7–12")
    draw_stat(draw, title_x + stat_w + stat_gap, stats_y, "TERM", "16 Weeks")
    draw_stat(draw, title_x, stats_y + 146, "FORMAT", "2x / Week")
    draw_stat(draw, title_x + stat_w + stat_gap, stats_y + 146, "CLASS", "20–25")
    draw_stat(draw, title_x, stats_y + 292, "ALIGNED", "Utah CASEL")
    draw_stat(draw, title_x + stat_w + stat_gap, stats_y + 292, "WEBSITE", "readyforreal.life")

    draw_left_snapshot(draw, title_x, stats_y + 454, LEFT_W - 96)
    draw_info_panel(
        draw,
        title_x,
        stats_y + 724,
        LEFT_W - 96,
        188,
        "WHY THIS MATTERS",
        [
            "Students need more than information. They need tools for communication, regulation, and responsible action.",
            "MMMF gives schools a practical way to teach those habits directly instead of assuming them.",
            "That supports school climate, personal responsibility, and real-world readiness.",
        ],
    )

    # founders panel
    founders_y = PAGE_H - MARGIN - 620
    draw.rounded_rectangle((MARGIN + 26, founders_y, MARGIN + LEFT_W - 26, PAGE_H - MARGIN - 26), radius=20, fill=NAVY_2)
    draw.text((MARGIN + 52, founders_y + 26), "FOUNDED BY", font=F_SANS_32, fill=GOLD_2)

    mike = circle_headshot(SITE_ROOT / "michael-terry-headshot.jpg", 146)
    mek = circle_headshot(SITE_ROOT / "mekenzi-terry-headshot.png", 146)
    img.paste(mike, (MARGIN + 52, founders_y + 84), mike)
    img.paste(mek, (MARGIN + 222, founders_y + 84), mek)

    draw.text((MARGIN + 52, founders_y + 254), "Michael R. Terry", font=F_SERIF_36, fill=WHITE)
    draw.text((MARGIN + 52, founders_y + 302), "Founder · Educator · Curriculum Designer", font=F_SANS_26, fill=MUTED)
    draw.text((MARGIN + 52, founders_y + 342), "Mekenzi G. Terry", font=F_SERIF_36, fill=WHITE)
    draw.text((MARGIN + 52, founders_y + 390), "Founder · Coach · Director · Community Builder", font=F_SANS_26, fill=MUTED)
    draw.text((MARGIN + 52, founders_y + 450), "readyforreal.life", font=F_SANS_32, fill=TEAL)
    draw.text((MARGIN + 52, founders_y + 492), "readyforreal.life44@gmail.com", font=F_SANS_32, fill=TEAL)
    draw.text((MARGIN + 52, founders_y + 542), "© Michael R. Terry & Mekenzi G. Terry · Protected Intellectual Property", font=F_SANS_24, fill="#7f93ba")

    # right area top branding
    logo_path = SITE_ROOT / "docs" / "assets" / "logo-square.png"
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo.thumbnail((170, 170), Image.Resampling.LANCZOS)
        img.paste(logo, (RIGHT_X + 36, MARGIN + 26), logo)

    draw.text((RIGHT_X + 230, MARGIN + 52), "READY FOR", font=F_SANS_60, fill=WHITE)
    draw.text((RIGHT_X + 230, MARGIN + 122), "REAL LIFE.", font=F_SANS_60, fill=GOLD_2)
    draw.text((RIGHT_X + 230, MARGIN + 208), "The life skills course your students actually need.", font=F_SANS_38, fill=WHITE)

    # section 1
    y = MARGIN + 312
    draw.text((RIGHT_X + 40, y), "THE GAP THIS COURSE FILLS", font=F_SANS_32, fill=GOLD_2)
    y = draw_wrapped(
        draw,
        "Academic achievement dominates curricula while students navigate complex social, digital, and emotional landscapes with few tools. Soft skills are assumed, not taught. This course makes them explicit, measurable, and transferable.",
        (RIGHT_X + 40, y + 56),
        F_SANS_36,
        WHITE,
        RIGHT_W - 80,
        line_gap=10,
    ) + 18

    # pillars
    draw.text((RIGHT_X + 40, y + 10), "FOUR CORE PILLARS", font=F_SANS_32, fill=GOLD_2)
    tag_y = y + 62
    left_x = RIGHT_X + 40
    right_x = RIGHT_X + 470
    draw_tag(draw, left_x, tag_y, "Respectful Communication", NAVY_2)
    draw_tag(draw, right_x, tag_y, "Emotional Regulation", NAVY_2)
    draw_tag(draw, left_x, tag_y + 64, "Decision-Making", NAVY_2)
    draw_tag(draw, right_x, tag_y + 64, "Accountability & Repair", NAVY_2)
    y = tag_y + 142

    # frameworks
    draw.text((RIGHT_X + 40, y + 10), "TWO STUDENT FRAMEWORKS", font=F_SANS_32, fill=GOLD_2)
    fw_y = y + 62
    box_w = (RIGHT_W - 100) // 2
    for i, (title, body1, body2) in enumerate([
        ("PLRR — REGULATION ROUTINE", "Pause · Label · Reframe · Respond", "Used before any decision under stress. Module 2 · Reinforced across all modules"),
        ("POCC — DECISION FRAMEWORK", "Pause · Options · Consequences · Choose", "Structured choice under pressure. Module 3 · Reinforced across all modules"),
    ]):
        x = RIGHT_X + 40 + i * (box_w + 20)
        draw.rounded_rectangle((x, fw_y, x + box_w, fw_y + 184), radius=20, fill=NAVY_2)
        draw.text((x + 22, fw_y + 20), title, font=F_SANS_32, fill=GOLD_2)
        draw.text((x + 22, fw_y + 74), body1, font=F_SANS_34, fill=WHITE)
        draw_wrapped(draw, body2, (x + 22, fw_y + 114), F_SANS_28, MUTED, box_w - 44, line_gap=6)
    y = fw_y + 210

    # modules
    draw.text((RIGHT_X + 40, y + 10), "FIVE MODULES", font=F_SANS_32, fill=GOLD_2)
    cards_y = y + 62
    mod_w = 170
    mod_h = 142
    mod_gap = 14
    modules = [
        ("01", "Modern\nManners"),
        ("02", "Emotional\nIntelligence"),
        ("03", "Conflict\nNavigation"),
        ("04", "Digital\nCitizenship"),
        ("05", "Personal\nGrowth"),
    ]
    for idx, (num, label) in enumerate(modules):
        row = 0 if idx < 3 else 1
        col = idx if idx < 3 else idx - 3
        x = RIGHT_X + 40 + col * (mod_w + mod_gap)
        if row == 1:
            x += (mod_w + mod_gap) // 2
        top = cards_y + row * (mod_h + 14)
        draw.rounded_rectangle((x, top, x + mod_w, top + mod_h), radius=18, fill=NAVY_2)
        draw.text((x + 16, top + 14), num, font=F_SANS_48, fill=GOLD_2)
        draw.multiline_text((x + 16, top + 60), label, font=F_SANS_28, fill=WHITE, spacing=3)
    y = cards_y + mod_h * 2 + 36

    # audience
    draw.text((RIGHT_X + 40, y + 8), "WHO IS THIS FOR?", font=F_SANS_32, fill=GOLD_2)
    audience_y = y + 56
    audience = [
        ("Grades 7–8", "Foundational. 1-term intro."),
        ("Grades 9–12", "Levels up each year."),
        ("Community Youth", "After-school, faith orgs."),
        ("Community Adults", "Workplace & family contexts."),
    ]
    aud_w = (RIGHT_W - 100) // 2
    aud_h = 88
    for idx, (title, desc) in enumerate(audience):
        row = idx // 2
        col = idx % 2
        ax = RIGHT_X + 40 + col * (aud_w + 20)
        ay = audience_y + row * (aud_h + 16)
        draw.rounded_rectangle((ax, ay, ax + aud_w, ay + aud_h), radius=18, fill=NAVY_2)
        dot = GOLD_2 if idx % 2 else GREEN
        draw.ellipse((ax + 18, ay + 18, ax + 36, ay + 36), fill=dot)
        draw.text((ax + 48, ay + 10), title, font=F_SANS_34, fill=WHITE)
        draw.text((ax + 48, ay + 46), desc, font=F_SANS_28, fill=MUTED)
    y = audience_y + aud_h * 2 + 38

    panel_h = 150
    draw_info_panel(
        draw,
        RIGHT_X + 40,
        y,
        RIGHT_W - 80,
        panel_h,
        "SCHOOL VALUE AND IMPLEMENTATION",
        [
            "Clearer expectations for conduct, communication, and accountability across school culture.",
            "Real-world SEL designed for implementation, transfer, and measurable use.",
            "Schools can pilot MMMF as a term course, workshop series, advisory support, or facilitator preparation pathway.",
        ],
    )
    y += panel_h + 26

    # measured
    draw.rounded_rectangle((RIGHT_X + 40, y, PAGE_W - MARGIN - 40, y + 156), radius=18, fill=NAVY_2)
    draw.text((RIGHT_X + 60, y + 20), "HOW LEARNING IS MEASURED", font=F_SANS_32, fill=GOLD_2)
    draw_measure_tags(draw, RIGHT_X + 60, y + 68, ["Weekly Journals", "Role-Play Rubrics", "Pre/Post Surveys", "Capstone Presentation", "Novel Scenario Task"], RIGHT_W - 120)
    y += 184

    draw.text((RIGHT_X + 40, y), "WHAT STUDENTS WILL BE ABLE TO DO", font=F_SANS_32, fill=GOLD_2)
    y = draw_bullet_list(draw, RIGHT_X + 40, y + 48, [
        "Apply respectful communication across school, workplace, and digital contexts",
        "Self-regulate using the PLRR routine as a performance skill — not a therapy tool",
        "Make structured decisions under pressure using the POCC framework",
        "Navigate digital life with permanence, privacy, and reputation in mind",
        "Own mistakes, repair relationships, and follow through on commitments",
        "Transfer all skills independently to unfamiliar, high-stakes real-world situations",
    ], RIGHT_W - 80) + 12

    draw.rounded_rectangle((RIGHT_X + 40, y, PAGE_W - MARGIN - 40, y + 96), radius=0, fill="#314c79")
    draw.text((RIGHT_X + 66, y + 20), "RESEARCH FOUNDATION", font=F_SANS_32, fill=GOLD_2)
    draw.text((RIGHT_X + 66, y + 56), "Tyler · Bruner · Dewey · CASEL · Stern et al. · Wiles & Bondi · Utah SBOE Standards", font=F_SANS_28, fill=MUTED)
    y += 122

    draw.rounded_rectangle((RIGHT_X + 40, y, PAGE_W - MARGIN - 40, PAGE_H - MARGIN - 120), radius=24, fill=GOLD)
    draw.text((RIGHT_X + 70, y + 32), "ENROLL · PARTNER · LICENSE", font=F_SANS_60, fill=INK)
    draw_wrapped(draw, "Register your class, school, or community program at readyforreal.life", (RIGHT_X + 70, y + 110), F_SANS_42, INK, RIGHT_W - 140, line_gap=10)
    draw.text((RIGHT_X + 70, y + 218), "Questions? Contact the founders directly:", font=F_SANS_38, fill=INK)
    draw.text((RIGHT_X + 70, y + 272), "readyforreal.life44@gmail.com  ·  (435) 840-1896", font=F_SANS_42, fill=INK)

    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    rgb = img.convert("RGB")
    rgb.save(OUT_PNG, "PNG")
    rgb.save(OUT_PDF, "PDF", resolution=300.0)


if __name__ == "__main__":
    main()
