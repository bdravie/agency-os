from agency import llm


def test_model_aliases_resolve():
    assert llm.resolve_model("haiku") == "claude-haiku-5-5"
    assert llm.resolve_model("sonnet") == "claude-sonnet-5-5"
    assert llm.resolve_model("opus") == "claude-opus-5-5"


def test_full_model_id_passes_through():
    assert llm.resolve_model("claude-sonnet-5-5") == "claude-sonnet-5-5"
