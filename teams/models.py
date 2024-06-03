from django.db import models

class Team(models.Model):
    name = models.CharField(max_length=100)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE)
    

    def __str__(self):
        return self.name
