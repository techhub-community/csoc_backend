from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from membership.models import Membership

from .models import Invitation
from .serializers import InvitationSerializer


class SendInvitationAPIView(generics.CreateAPIView):
    queryset = Invitation.objects.all()
    serializer_class = InvitationSerializer

    def perform_create(self, serializer):
        serializer.save(sender=self.request.user, status='pending')

class ListUserInvitationsAPIView(generics.ListAPIView):
    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Invitation.objects.filter(receiver=self.request.user)

class JoinTeamAPIView(generics.GenericAPIView):

    def post(self, request, invitation_id):
        invitation = get_object_or_404(Invitation, id=invitation_id, receiver=request.user, status='pending')
        Membership.objects.create(user=request.user, team=invitation.team, role='mentee')
        invitation.status = 'accepted'
        invitation.save()
        return Response({'status': 'accepted'}, status=status.HTTP_200_OK)