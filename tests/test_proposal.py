from agency import proposal


def test_parse_fit_ok():
    assert proposal.parse_fit("8|Clear n8n reporting job") == (8, "Clear n8n reporting job")


def test_parse_fit_clamps_and_falls_back():
    assert proposal.parse_fit("15|x")[0] == 10
    assert proposal.parse_fit("no idea")[0] == 1


def test_empty_portfolio_forbids_projects():
    assert proposal.read_portfolio() == proposal.NO_PORTFOLIO
