from agency import proposal


def test_parse_fit_ok():
    assert proposal.parse_fit("8|Clear n8n reporting job") == (8, "Clear n8n reporting job")


def test_parse_fit_clamps_and_falls_back():
    assert proposal.parse_fit("15|x")[0] == 10
    assert proposal.parse_fit("no idea")[0] == 1


def _portfolio(tmp_path, monkeypatch, text):
    """Point read_portfolio at a temporary file, so the owner's real portfolio doesn't affect the result."""
    (tmp_path / "portfolio").mkdir()
    (tmp_path / "portfolio" / "portfolio.md").write_text(text)
    monkeypatch.setattr(proposal, "ROOT", tmp_path)


def test_empty_portfolio_forbids_projects(tmp_path, monkeypatch):
    _portfolio(tmp_path, monkeypatch, "Intro only.\n\n<!--\n## Template project\n-->\n")
    assert proposal.read_portfolio() == proposal.NO_PORTFOLIO


def test_portfolio_with_an_entry_is_used(tmp_path, monkeypatch):
    _portfolio(tmp_path, monkeypatch, "# Portfolio\n\n## A real project\n- Status: demo\n")
    assert "A real project" in proposal.read_portfolio()
