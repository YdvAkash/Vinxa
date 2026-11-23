package com.vinxa.live.ai;

import com.vinxa.live.ai.dto.CopilotAskRequest;
import com.vinxa.live.ai.dto.CopilotAskResponse;
import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/copilot")
public class MeetingCopilotController {

    private final MeetingCopilotService meetingCopilotService;

    public MeetingCopilotController(MeetingCopilotService meetingCopilotService) {
        this.meetingCopilotService = meetingCopilotService;
    }

    @PostMapping("/ask")
    public ResponseEntity<CopilotAskResponse> askQuestion(@RequestBody CopilotAskRequest request) {
        User user = SecurityUtils.getCurrentUser();
        CopilotAskResponse response = meetingCopilotService.askQuestion(user, request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/translate")
    public ResponseEntity<TranslateResponse> translateSegments(@RequestBody TranslateRequest request) {
        SecurityUtils.getCurrentUser();
        java.util.List<String> translations = meetingCopilotService.translateTexts(request.texts(), request.targetLanguage());
        return ResponseEntity.ok(new TranslateResponse(translations, request.targetLanguage()));
    }

    public record TranslateRequest(java.util.List<String> texts, String targetLanguage) {}
    public record TranslateResponse(java.util.List<String> translations, String targetLanguage) {}
}
